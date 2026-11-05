/*
  Checador RFID con ESP32 + RC522 — versión FreeRTOS + WiFi
  ─────────────────────────────────────────────────────────
  Librerías necesarias (Gestor de librerías de Arduino IDE):
    • "MFRC522" de GithubCommunity
    • WiFi y HTTPClient: vienen incluidas con el core ESP32

  Placa: "ESP32 Dev Module"

  Conexiones RC522 → ESP32:
    SDA(SS) → GPIO 5     SCK  → GPIO 18    MOSI → GPIO 23
    MISO    → GPIO 19    RST  → GPIO 22    3.3V → 3V3    GND → GND
  (El RC522 funciona a 3.3 V. ¡No lo conectes a 5 V!)

  LEDs / Buzzer:
    LED verde → GPIO 26 (con resistencia 220 Ω)
    Buzzer    → GPIO 27

  Arquitectura de tareas FreeRTOS:
    tareaLecturaRFID  — detecta tarjeta → enciende LED inmediatamente
                        → manda UID por cola
    tareaEnvioHTTP    — recibe UID → POST al servidor → manda resultado por cola
    tareaFeedback     — recibe resultado → parpadea LED según éxito/error
                        y suena buzzer
*/

#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ══════════════════════════════════════════════════════
//  CAMBIA ESTOS CUATRO DATOS ANTES DE SUBIR EL CÓDIGO
// ══════════════════════════════════════════════════════
const char* WIFI_SSID  = "Mega_2.4G_DFD9";            // Nombre de tu red WiFi
const char* WIFI_PASS  = "2EKsHAZX";       // Contraseña WiFi
// IP de la PC donde corre "npm run server" (NO uses "localhost")
// Puedes verla ejecutando: ipconfig (Windows) o ifconfig (Mac/Linux)
const char* SERVER_URL = "http://192.168.1.44:3000/api/punch";
const char* DEVICE_KEY = "3003"; // Debe ser idéntica a DEVICE_KEY en server/index.js
// ══════════════════════════════════════════════════════

#define SS_PIN     5
#define RST_PIN    22
#define BUZZER_PIN 27
#define LED_OK     26

MFRC522 rfid(SS_PIN, RST_PIN);

// ── Colas entre tareas ────────────────────────────────
// Cola 1: UID leído (puntero a String en heap)
QueueHandle_t queueUID;
// Cola 2: resultado del servidor (true = OK, false = error)
QueueHandle_t queueResultado;


// ── Utilidades ────────────────────────────────────────

// Convierte los bytes del UID a formato "AA:BB:CC:DD" en mayúsculas
String uidHex() {
  String s = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (i) s += ":";
    if (rfid.uid.uidByte[i] < 0x10) s += "0";
    s += String(rfid.uid.uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

// Conecta (o reconecta) al WiFi; parpadea el LED de error mientras espera
void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Conectando al WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    vTaskDelay(pdMS_TO_TICKS(400));
  }
  Serial.println("\nWiFi conectado. IP del ESP32: " + WiFi.localIP().toString());
}


// ── TAREA 1: Lectura RFID ─────────────────────────────
void tareaLecturaRFID(void* pvParameters) {
  while (1) {
    if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {

      String uid = uidHex();
      Serial.println("\nTarjeta detectada: " + uid);

      // ── LED de lectura inmediata ──────────────────────
      // Encendemos el LED en cuanto se detecta la tarjeta
      // para dar retroalimentación visual instantánea
      digitalWrite(LED_OK, HIGH);
      vTaskDelay(pdMS_TO_TICKS(100)); // Destello breve de 100 ms
      digitalWrite(LED_OK, LOW);
      // ─────────────────────────────────────────────────

      // Mandamos el UID a la siguiente tarea (reservamos memoria en heap)
      String* ptr = new String(uid);
      xQueueSend(queueUID, &ptr, portMAX_DELAY);

      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();

      // Anti-rebote: evita lecturas dobles de la misma pasada
      vTaskDelay(pdMS_TO_TICKS(1100)); // Ajustado: 100ms LED + 1100ms = 1200ms total
    }
    vTaskDelay(pdMS_TO_TICKS(50)); // Cede CPU a otras tareas
  }
}


// ── TAREA 2: Envío HTTP al servidor ───────────────────
void tareaEnvioHTTP(void* pvParameters) {
  String* ptr;

  while (1) {
    if (xQueueReceive(queueUID, &ptr, portMAX_DELAY) == pdPASS) {
      String uid = *ptr;
      delete ptr; // Liberamos la memoria reservada en la tarea 1

      // Reconecta si se perdió la señal
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi desconectado. Reconectando...");
        connectWifi();
      }

      // POST a /api/punch con el UID y la clave de dispositivo
      HTTPClient http;
      http.begin(SERVER_URL);
      http.setTimeout(5000);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("x-api-key", DEVICE_KEY);

      int code = http.POST("{\"uid\":\"" + uid + "\"}");
      String res = (code > 0) ? http.getString() : "";
      http.end();

      Serial.println("Respuesta del servidor: " + String(code) + " — " + res);

      // El servidor responde { "ok": true, ... } cuando registra correctamente
      bool ok = (code == 200 && res.indexOf("\"ok\":true") >= 0);

      xQueueSend(queueResultado, &ok, portMAX_DELAY);
    }
  }
}


// ── TAREA 3: Feedback (LED + buzzer) ─────────────────
void tareaFeedback(void* pvParameters) {
  bool resultado;

  while (1) {
    if (xQueueReceive(queueResultado, &resultado, portMAX_DELAY) == pdPASS) {

      if (resultado) {
        // ✅ Checada registrada — estilo Apple Pay
        Serial.println("✓ Checada registrada en el servidor.");
        digitalWrite(LED_OK, HIGH);

        tone(BUZZER_PIN, 1047);           // Do6 — corto y ágil
        vTaskDelay(pdMS_TO_TICKS(60));
        noTone(BUZZER_PIN);
        vTaskDelay(pdMS_TO_TICKS(30));
        tone(BUZZER_PIN, 1568);           // Sol6 — confirmación
        vTaskDelay(pdMS_TO_TICKS(350));
        noTone(BUZZER_PIN);

        digitalWrite(LED_OK, LOW);

      } else {
        // ❌ Error o tarjeta no registrada
        Serial.println("✗ Tarjeta denegada o error en el servidor.");

        tone(BUZZER_PIN, 300);
        vTaskDelay(pdMS_TO_TICKS(300));
        noTone(BUZZER_PIN);
      }
    }
  }
}


// ── SETUP ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_OK, OUTPUT);

  SPI.begin();
  rfid.PCD_Init();

  connectWifi(); // Bloquea hasta estar conectado

  // Colas: queueUID guarda punteros (tamaño = sizeof(String*))
  queueUID       = xQueueCreate(5, sizeof(String*));
  queueResultado = xQueueCreate(5, sizeof(bool));

  if (queueUID != NULL && queueResultado != NULL) {
    //                     Función            Nombre          Stack   Params  Prior  Handle
    xTaskCreate(tareaLecturaRFID, "Lectura_RFID",  4096,   NULL,   2,     NULL);
    xTaskCreate(tareaEnvioHTTP,   "Envio_HTTP",    8192,   NULL,   1,     NULL); // 8 KB por WiFi/HTTP
    xTaskCreate(tareaFeedback,    "Feedback_IO",   2048,   NULL,   3,     NULL); // Mayor prioridad para respuesta inmediata
    Serial.println("Sistema FreeRTOS iniciado. Esperando tarjeta...");
  } else {
    Serial.println("ERROR: No se pudo crear la cola. Reiniciando...");
    ESP.restart();
  }
}

void loop() {
  vTaskDelete(NULL); // FreeRTOS maneja todo; el loop queda vacío
}
