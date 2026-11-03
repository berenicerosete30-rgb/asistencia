# Control de asistencia y nómina semanal

React + Express + SQLite, todo en tu computadora. El ESP32 se conecta por WiFi.

## Requisitos
Node.js 22.5 o superior (https://nodejs.org). Revisa con `node -v`. La base de datos SQLite viene incluida en Node, no se instala nada extra.

## Primera vez
    npm install
    npm start

`npm start` compila la web y arranca el servidor. Abre http://localhost:3000.
La consola también muestra la IP de la computadora para el ESP32.
La base de datos se crea sola en `data/asistencia.db` con datos de ejemplo
(en Configuración puedes restablecerlos; para empezar limpio, borra la carpeta `data`).

## Desarrollo
    npm run dev

Corre el servidor y la web con recarga automática (web en http://localhost:5173).

## Clave del dispositivo
    DEVICE_KEY=mi-clave-secreta npm start        (Mac/Linux)
    set DEVICE_KEY=mi-clave-secreta && npm start  (Windows, cmd)

Pon la misma clave en `esp32/checador/checador.ino`.

## Conectar el ESP32
1. La computadora y el ESP32 deben estar en la misma red WiFi.
2. En el sketch pon `SERVER_URL` con la IP que muestra la consola, por ejemplo `http://192.168.1.50:3000/api/punch`. "localhost" no sirve: para el ESP32 sería él mismo.
3. Reserva esa IP para tu computadora en el router, o cambiará y el ESP32 dejará de encontrarla.
4. En Windows, permite el puerto 3000 en el firewall cuando lo pregunte (red privada).
5. El servidor debe estar encendido durante el horario laboral. Si está apagado, el ESP32 da 3 pitidos y esa checada se pierde.

## Imagen de marca
Colores, tipografías (Poppins e Inter, incluidas localmente, sin internet) y logo están en `src/styles.css` y `public/`.

## Estructura
- `src/lib/rules.js`: reglas de negocio puras (compartidas por web y servidor).
- `server/`: API, base de datos SQLite y datos de ejemplo.
- `src/`: web en React. Se actualiza sola cada 5 segundos.
- `esp32/checador/`: código para Arduino IDE.

## API
- `POST /api/punch` (header `x-api-key`, body `{"uid":"04:A3:1B:7C"}`): checada real; la hora la pone el servidor.
- `POST/PUT/DELETE /api/employees`: alta, edición y baja de empleados.
- `GET /api/last-unknown`: última tarjeta no registrada que pasó por el lector.
- `POST /api/simulate`: checada simulada desde el panel.
- `GET /api/state?start=YYYY-MM-DD`: semana a mostrar y la siguiente.
