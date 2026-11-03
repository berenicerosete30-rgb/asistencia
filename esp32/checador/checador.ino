/*
  Checador RFID con ESP32 + RC522
  Librería (Gestor de librerías de Arduino IDE): "MFRC522" de GithubCommunity.
  Placa: "ESP32 Dev Module".

  Conexiones RC522 -> ESP32:
    SDA(SS) -> GPIO 5     SCK -> GPIO 18     MOSI -> GPIO 23
    MISO    -> GPIO 19    RST -> GPIO 22     3.3V -> 3V3    GND -> GND
  (El RC522 funciona a 3.3 V. No lo conectes a 5 V.)
  LED verde -> GPIO 26 (con resistencia de 220 ohm), LED rojo -> GPIO 27, buzzer -> GPIO 25.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

// ---- CAMBIA ESTOS DATOS ----
const char* WIFI_SSID  = "TU_WIFI";
const char* WIFI_PASS  = "TU_CLAVE_WIFI";
// IP de la computadora donde corre el servidor (NO uses "localhost": para el ESP32 sería él mismo).
const char* SERVER_URL = "http://192.168.1.50:3000/api/punch";
const char* DEVICE_KEY = "cambia-esta-clave";  // igual que DEVICE_KEY del servidor
// -----------------------------

#define SS_PIN 5
#define RST_PIN 22
#define LED_OK 26
#define LED_ERR 27
#define BUZZER 25

MFRC522 rfid(SS_PIN, RST_PIN);

void beep(int times, int ms) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER, HIGH); delay(ms);
    digitalWrite(BUZZER, LOW);  delay(ms);
  }
}
void signal(bool ok) {
  digitalWrite(ok ? LED_OK : LED_ERR, HIGH);
  ok ? beep(1, 150) : beep(3, 120);
  delay(600);
  digitalWrite(LED_OK, LOW);
  digitalWrite(LED_ERR, LOW);
}
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
void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_ERR, !digitalRead(LED_ERR));
    delay(400);
  }
  digitalWrite(LED_ERR, LOW);
  Serial.println("WiFi conectado: " + WiFi.localIP().toString());
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_OK, OUTPUT); pinMode(LED_ERR, OUTPUT); pinMode(BUZZER, OUTPUT);
  SPI.begin();
  rfid.PCD_Init();
  connectWifi();
  signal(true);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uid = uidHex();
  Serial.println("Tarjeta: " + uid);

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", DEVICE_KEY);
  int code = http.POST("{\"uid\":\"" + uid + "\"}");
  String res = code > 0 ? http.getString() : "";
  http.end();

  Serial.println(String(code) + " " + res);
  signal(code == 200 && res.indexOf("\"ok\":true") >= 0);  // verde = registrado, rojo = error

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1200);
}
