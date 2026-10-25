# PlantNet — Smart Plant Care Network 🌱

An Expo (React Native) app that runs in **Expo Go** and shows live readings from ESP32 sensor nodes on your
Wi-Fi. There's no demo data: everything on screen comes from a node's readings, or from something you logged
(a watering, a feed, a photo).

```bash
npm install
npx expo start   # then scan the QR code with Expo Go
```

> **Expo SDK 54.** This is deliberate, not stale: the Expo Go app on the Apple App Store stops at
> SDK 54 — SDK 55 and later were never published there, and on a physical iPhone you can only
> install what the App Store offers. Staying on 54 is what makes `npx expo start` + scan-the-QR
> work on an iPhone with no build step. To move to a newer SDK you would need a custom Expo Go
> (`npx eas-cli go`, installed via TestFlight) or a development build.

---

## How it works

- **Adding a plant** asks for the ESP32's address (e.g. `172.20.10.2`, or `172.20.10.2:8080` for another
  port). The app reads the node once, and you can only continue when that read works.
- **Polling.** While the app is open, every ESP32 is read every 2 s (`GET http://<address>/`). Several plants
  can share one node.
- **Storage.** History keeps one point per 5 minutes, up to 14 days, saved on the phone with AsyncStorage.
  Nothing is recorded while the app is closed.
- **Alerts**, all from real readings: node not responding (no reading for 15 s), soil below or well above
  the target band, temperature outside the species range, light sensor not answering, reservoir below 18%
  (critical below 8%), and fertiliser overdue (from your logged feeds).
- **Next watering** is a least-squares fit of the soil readings since your last logged watering. It needs
  about an hour of data first.
- **Health score** blends soil vs. target, time in band, temperature, daytime light (when the BH1750
  works) and feeding.
- **Not measured, so not shown:** humidity, and the pump. There is no pump or relay on the node, so
  watering is something you do and then log with **I watered it**.

## Layout

```
src/
  app/            expo-router routes: (tabs), onboarding, plant/[id]
  components/     ui.tsx (design system), charts.tsx (SVG charts), plant-card.tsx
  domain/         types, the 14-species care catalogue, insights.ts (health, prediction, alerts, reports)
  store/          garden.tsx (polling, history, actions, persistence)
  theme/          colour, spacing and type tokens
```

`npx tsx src/domain/insights.check.ts` runs a self-check of the alert and prediction logic.

## Hardware (ESP32 sensor node)

| Part | Reading |
|---|---|
| Soil moisture sensor | soil % |
| TMP36 | temperature |
| BH1750 | light (lux); the firmware sends `-1` when it's silent |
| Water level sensor | reservoir % |

- `hardware/plantnet_node/plantnet_node.ino`: the firmware. Set `WIFI_SSID` / `WIFI_PASS`, flash with the
  Arduino IDE (board: **DOIT ESP32 DEVKIT V1**), open the Serial Monitor at 115200 baud and note the
  printed address.
- In the app, tap **+**, pick the species, and type that address on the **Connect ESP32** step. The phone must
  be on the same Wi-Fi.
- `hardware/wokwi/`: the same circuit for the [Wokwi](https://wokwi.com) simulator: `diagram.json` plus
  custom chips for the four sensors, each with a slider. Wokwi's simulated ADC reads about 30% off; the real
  board doesn't.

### Wiring (18 jumpers)

The 30-pin DevKit is too wide to leave free holes on both sides of an 830 breadboard, so it sits **beside**
the breadboard. Use male-to-female jumpers from its pins. The breadboard only carries the power rails.
If your board's rail lines have a gap in the middle, bridge each rail across it.

| From | To | Note |
|---|---|---|
| ESP32 **3V3** | top **+** rail | 3.3 V rail |
| ESP32 **GND** | top **−** rail | |
| ESP32 **VIN** | bottom **+** rail | 5 V from USB, for the TMP36 |
| top **−** rail | bottom **−** rail | common ground |
| Soil **VCC** / **GND** | top + / top − | |
| Soil **AO** | ESP32 **D34** | DO unused (a 3-pin capacitive sensor: AOUT → D34) |
| Water level **+** / **−** | top + / top − | |
| Water level **S** | ESP32 **D32** | |
| BH1750 **VCC** / **GND** | top + / top − | |
| BH1750 **ADDR** | top − | sets I2C address 0x23 |
| BH1750 **SCL** | ESP32 **D22** | |
| BH1750 **SDA** | ESP32 **D21** | |
| TMP36 **+VS** (left leg) | bottom + (5 V) | flat face toward you, legs down |
| TMP36 **VOUT** (middle) | ESP32 **D35** | 500 mV at 0 °C + 10 mV/°C, safe for the 3.3 V input |
| TMP36 **GND** (right) | bottom − | |

Only ADC1 pins (32–39) are used for the analog sensors, because ADC2 stops working while Wi-Fi is on.
Calibrate on the real sensors: watch the `raw mV` values on Serial and set the `SOIL_*` / `WATER_*`
constants at the top of the sketch.
# software-project
