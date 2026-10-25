// PlantNet sensor node — ESP32 DevKit V1 (30-pin, CP2102)
// Reads soil moisture, TMP36 temperature, BH1750 light and reservoir water level,
// prints them on Serial (115200) and serves them as JSON at http://<ip>/ for the app.
#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>

const char *WIFI_SSID = "karman’s iPhone";  // your Wi-Fi name on real hardware
const char *WIFI_PASS = "karman02";

// Analog pins are all ADC1: ADC2 pins stop working while Wi-Fi is on.
const int SOIL_PIN = 34;   // soil sensor AO
const int TEMP_PIN = 35;   // TMP36 VOUT
const int WATER_PIN = 32;  // water level sensor S
const int SDA_PIN = 21, SCL_PIN = 22;
const uint8_t BH1750_ADDR = 0x23;  // ADDR pin tied to GND

// Calibration: watch the raw mV on Serial and set these for your own sensors.
int SOIL_DRY_MV = 3100;    // probe in dry air
int SOIL_WET_MV = 1000;    // probe in freshly watered soil
int WATER_EMPTY_MV = 0;    // sensor out of the water
int WATER_FULL_MV = 1600;  // sensor submerged up to its top line
float TEMP_OFFSET_C = 0;   // TMP36 vs. a reference thermometer

WebServer server(80);
float soil, temp, lux, tank;
int soilMv, tempMv, waterMv;

int readMv(int pin) {  // the ESP32 ADC is noisy, so average 16 samples
  long sum = 0;
  for (int i = 0; i < 16; i++) sum += analogReadMilliVolts(pin);
  return sum / 16;
}

float pct(int mv, int at0, int at100) {
  return constrain((mv - at0) * 100.0f / (at100 - at0), 0.0f, 100.0f);
}

void startBH1750() {
  Wire.beginTransmission(BH1750_ADDR);
  Wire.write(0x10);  // continuous high-resolution mode
  Wire.endTransmission();
}

float readLux() {
  if (Wire.requestFrom((int)BH1750_ADDR, 2) != 2) {
    startBH1750();  // not answering: re-arm it and report "no reading"
    return -1;
  }
  uint16_t raw = Wire.read() << 8;
  raw |= Wire.read();
  // Re-arm every time: after a power blip the sensor wakes up idle and would otherwise answer 0 forever.
  // A measurement takes ~180 ms, so it's ready long before the next read 2 s later.
  startBH1750();
  return raw / 1.2f;
}

void readSensors() {
  soilMv = readMv(SOIL_PIN);
  tempMv = readMv(TEMP_PIN);
  waterMv = readMv(WATER_PIN);
  soil = pct(soilMv, SOIL_DRY_MV, SOIL_WET_MV);
  temp = (tempMv - 500) / 10.0f + TEMP_OFFSET_C;  // TMP36: 500 mV at 0 °C, 10 mV per °C
  tank = pct(waterMv, WATER_EMPTY_MV, WATER_FULL_MV);
  lux = readLux();
}

String json() {
  return String("{\"soil\":") + soil + ",\"temp\":" + temp + ",\"lux\":" + lux + ",\"tank\":" + tank + "}";
}

void setup() {
  Serial.begin(115200);
  analogSetAttenuation(ADC_11db);  // 0–3.1 V range
  Wire.begin(SDA_PIN, SCL_PIN);
  startBH1750();

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Wi-Fi");
  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print('.');
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? " connected, app address: http://" + WiFi.localIP().toString()
                                               : " failed, sensors still print here");

  server.on("/", [] {
    server.sendHeader("Access-Control-Allow-Origin", "*");  // lets the web build of the app read it
    server.send(200, "application/json", json());
  });
  server.begin();
}

void loop() {
  static unsigned long last = 0;
  if (millis() - last >= 2000) {
    last = millis();
    readSensors();
    Serial.printf("[%s] raw mV soil=%d tmp36=%d water=%d  ->  ",
                  WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "no wifi", soilMv, tempMv, waterMv);
    Serial.println(json());

    static int tries = 0;
    if (WiFi.status() != WL_CONNECTED && ++tries % 10 == 0) {  // every ~20 s while offline
      WiFi.disconnect();  // a scan can't run while a join attempt is in progress
      int n = WiFi.scanNetworks();
      Serial.printf("Can't join \"%s\". Networks I can see:\n", WIFI_SSID);
      for (int i = 0; i < n; i++) Serial.printf("  \"%s\"  %d dBm\n", WiFi.SSID(i).c_str(), WiFi.RSSI(i));
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }

    static int luxFails = 0;
    if (lux < 0 && ++luxFails % 10 == 0) {  // every ~20 s while the BH1750 is silent
      Serial.print("BH1750 not answering at 0x23. I2C devices found on SDA=21/SCL=22:");
      int found = 0;
      for (uint8_t a = 1; a < 127; a++) {
        Wire.beginTransmission(a);
        if (Wire.endTransmission() == 0) Serial.printf(" 0x%02X", a), found++;
      }
      Serial.println(found ? "" : " none");
    }
  }
  server.handleClient();
  delay(10);
}
