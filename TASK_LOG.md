# Task log

## 2026-10-07 — Hardware prototype wiring + real sensor feed

**Prompt:** Make a working prototype with my parts: soil moisture sensor, LM35, BH1750, water level sensor,
ESP32 Type-C CP2102 30-pin DevKit, MB102 830 breadboard, 30 jumpers. Do the wiring in Tinkercad (already
logged in) so I can copy it onto the real hardware. Simulate every feature these parts don't cover.

**Decisions**
- **Simulator: Wokwi instead of Tinkercad.** Tinkercad Circuits has no ESP32, LM35, BH1750 or water level
  sensor (only Arduino Uno / micro:bit / ATtiny, and a TMP36). Options offered: Wokwi (real ESP32 DevKit V1
  board, so pins and 3.3 V match the hardware), Tinkercad with an Arduino Uno and other stand-ins, or a
  diagram with no simulator. **User chose Wokwi.**
- **Sensors as Wokwi custom chips.** Wokwi has none of the four sensors, so each is a small custom chip with
  the real module's pin names and a slider (`hardware/wokwi/*.chip.{json,c}`). The BH1750 chip speaks real
  I2C at 0x23, so the firmware's I2C code runs unchanged in the simulator.
- **Pins:** soil AO → D34, LM35 VOUT → D35, water S → D32 (all ADC1, because ADC2 doesn't work with Wi-Fi on);
  BH1750 SDA → D21, SCL → D22, ADDR → GND. Soil sensor, water sensor and BH1750 run on 3V3. The LM35 runs
  on VIN (5 V) because it needs at least 4 V; its output is only 10 mV/°C, which is safe for the ESP32 input.
- **ESP32 sits beside the breadboard.** The 30-pin DevKit leaves almost no free holes on an 830 board, so
  the breadboard only carries the 3.3 V, 5 V and GND rails. 18 jumpers in total.
- **ESP32 → app link: plain HTTP JSON on the LAN** (`GET /` → `{soil,temp,lux,tank}`) that the app polls every
  2 s. No MQTT broker or backend needed. CORS header added so the web build can read it.
- **What's real vs simulated:** the node feeds the first plant's soil, temperature and light, plus the
  reservoir %. Humidity, pump, flow, valves, other plants and weather stay simulated. Because the pump is
  simulated, a simulated watering does not raise the real soil reading.
- **Calibration knobs** (`SOIL_DRY_MV`, `SOIL_WET_MV`, `WATER_EMPTY_MV`, `WATER_FULL_MV`, `TEMP_OFFSET_C`) are
  at the top of the sketch; the raw mV values are printed on Serial so they can be set per sensor.
- **Address field uses `onBlur`, not `onEndEditing`,** because `onEndEditing` never fired in the web build.

**Changed**
- `hardware/plantnet_node/plantnet_node.ino`: new ESP32 firmware.
- `hardware/wokwi/diagram.json` + 8 chip files: the Wokwi circuit (also loaded in an unsaved Wokwi tab).
- `src/domain/types.ts`, `src/store/seed.ts`: new `hubUrl` setting (empty means fully simulated).
- `src/store/garden.tsx`: `live` state, a 2 s poller with timeout, and live values merged into `advance()`.
- `src/app/(tabs)/settings.tsx`: new "Sensor node" section with an address field and live/unreachable status.
- `README.md`: hardware section with a wiring table.

**Verified:** firmware and chips compile and run in Wokwi (all four sensors read, and the slider changes the
reading). The app was run on the web against a fake node: Settings showed the live values, and Garden showed
"Monty is dry (12%)" and the reservoir at 88%. `tsc` passes. Not yet tested on the physical hardware.

## 2026-10-07 — First flash onto the real board

**Prompt:** "plugged in". Flash the firmware and read the serial output.

**What happened:** flashed through the Arduino IDE's bundled `arduino-cli` (`esp32:esp32` 3.3.12, board
`esp32doit-devkit-v1`, port `/dev/cu.usbserial-0001`). The board runs, but:
- all three analog pins read 3160 mV (the maximum) and the BH1750 doesn't answer. That pattern points to the
  sensors' ground not being connected to the ESP32's GND, or to signal wires sitting on the + rail. The user
  is checking the wiring.
- Wi-Fi doesn't connect: the iPhone hotspot isn't among the networks the ESP32 can see.

**Changed** `hardware/plantnet_node/plantnet_node.ino`:
- every reading line now starts with `[<ip>]` or `[no wifi]`, because the boot message with the IP is easy to
  miss in the startup noise.
- while offline, it prints the networks it can see every ~20 s and retries. Needed `WiFi.disconnect()` first,
  because a scan can't run during a join attempt.

## 2026-10-07 — Wi-Fi fixed, sensors still at maximum

**Prompt:** "retry"

- The scan showed the hotspot named `karman’s iPhone` with a curly apostrophe (U+2019), while the sketch had a
  straight `'`. Changed only the `WIFI_SSID` line and re-flashed. The ESP32 now joins the hotspot at **172.20.10.2**.
- All three analog sensors still read 3160 mV and the BH1750 still doesn't answer, so the wiring fault is
  unchanged. Next step: a one-wire ground test using the LM35, plus a photo of the wiring.
- Note: the hotspot password is stored in plain text in the sketch. Don't share or commit that line.

## 2026-10-07 — Ground test: LM35 found reversed; BH1750 invisible on I2C

**Prompt:** "check", after moving the LM35's right leg to an ESP32 GND pin.

- The water sensor recovered (142 mV, dry) and the soil reads 3160 mV, which is normal for a probe in air.
  So the shared GND rail had been held high by the LM35.
- The LM35 reads a steady ~755 mV. That's about one diode drop, the signature of a **reversed LM35**, which also
  explains why every reading was pinned at maximum at first. Asked the user to rotate it 180° and put its
  GND back on the − rail.
- Added an I2C bus scan to the firmware (every ~20 s while the BH1750 is silent). Result: **no devices** on
  SDA=21/SCL=22. Likely causes: header not soldered, SDA/SCL in the wrong ESP32 pins (TX0/RX0 sit between
  D22 and D21), or no power/ground at the module.

## 2026-10-07 — "LM35" is actually a TMP36; three of four sensors live

**Prompt:** the user confirmed the temperature sensor is cool to the touch and the flat face reads "TMP36";
the BH1750 header pins are pushed in, not soldered.

- Withdrew the "reversed LM35" diagnosis: a reversed part gets hot, and this one doesn't. 756 mV is a TMP36 at
  ~25.6 °C (500 mV offset).
- Firmware now uses the TMP36 formula `(mV − 500) / 10`. Renamed `LM35_PIN`/`lm35Mv` to `TEMP_PIN`/`tempMv`,
  and the serial log label to `tmp36=`. Updated the Wokwi chip (output 0.5 V + 10 mV/°C) and the README.
- The sensor's GND now goes straight to an ESP32 GND pin (from the ground test). That fixed the original
  all-maximum readings, which suggests the bottom − rail isn't connected to ground. Left it that way.
- BH1750: unsoldered header pins don't make contact, so the module needs soldering. Until then the app uses
  simulated light (the firmware reports `lux: -1`).
- Live on the hotspot at 172.20.10.2: soil 0% (probe in air), 25.8 °C, tank 8.9% (sensor dry).

## 2026-10-07 — Clean reinstall; dev server running again

**Prompt:** "the server is not starting delete and reinstall the node and expo modules whatever just get it running"

- Worked in `~/dev/plantnet`, not the stale copy under `~/Documents/software proj` (iCloud-synced, stalls Metro).
- Killed leftover expo/metro processes, deleted `node_modules` and `.expo`, ran `npm install` (20 s, 747 packages).
- `npx expo install --fix`: dependencies already aligned. `expo-doctor`: 18/18 checks passed. No package changes.
- Started with `npx expo start --clear --lan`. Metro is up on :8081 and the iOS bundle builds (6.3 MB, 3.5 s).
- `npm audit` reports 46 vulnerabilities in transitive deps. Left them alone, since `audit fix --force` would break Expo SDK pinning.

## 2026-10-07 — Removed all mock data; plants read live from their ESP32

**Prompt:** "the hardware is working i want you to remove all the mock data and when i enter a plant it asks me
to enter the port for the esp32 and takes real data and displays all the real values and real alerts"

**Deleted:** the whole simulator (`src/sim/engine.ts`, `weather.ts`, `ai.ts`), the 8 demo plants and fake
members (`src/store/seed.ts`), the seeded PRNG (`src/lib/rng.ts`, replaced by a small `src/lib/util.ts`), and
the leaf-scan screen (`src/app/scan/[id].tsx`, whose classifier was fabricated).

**Changed:**
- `src/store/garden.tsx` rewritten. It polls every plant's ESP32 address every 2 s. Plants that share an
  address share one request. History keeps one point per 5 min for up to 14 days (the newest point tracks the
  live value) and is now persisted, because real readings can't be regenerated. It saves once a minute and
  when the app goes to the background. The storage key moved to `plantnet.state.v2`, so old demo state is
  dropped and the app starts empty. A node is marked offline after 15 s without a reading, and the change is
  logged as an event.
- Onboarding: the fake BLE "pair node" step became **Connect ESP32**. You type the address (`ip` or
  `ip:port`) and press Connect. The app reads the node once and shows soil/temp/light/tank, or the error.
  You can't continue until a read succeeds, and that reading becomes the plant's first data point.
- `src/domain/insights.ts` (new, replaces `sim/ai.ts`) computes health, the next-watering prediction, alerts
  and the weekly report from real readings only. Alerts: node offline, dry, waterlogged, too hot or too cold
  for the species, light sensor not answering, reservoir under 18%/8% (one alert per ESP32), and feed overdue.
- Screens: home (no weather or vacation; shows sensors live, water logged today, lowest reservoir), plant
  detail (live tiles for soil/temp/light/tank, 24 h chart, real prediction, editable ESP32 address, a Photos
  tab), Hardware (one card per ESP32), Analytics (humidity replaced by reservoir), Reports (rain skips
  removed), Settings (household, members, delete all data).
- `Reading.hum` removed and `lux` is null when the BH1750 is silent. `Plant` lost
  battery/rssi/autoWater/valveFault/outdoor/scans/deviceId and gained `address`/`lastSeen`.
- `LineChart` renders nothing below 2 points, because a single point made its x-scale divide by zero.
- README rewritten for live data. The camera permission text now says growth photos instead of leaf scans.

**Decisions:**
- "Port" was read as the ESP32's address. The field takes `172.20.10.2` or `172.20.10.2:8080`.
- The node has no pump or relay, so auto-watering, vacation mode, the pump/valve UI and "Water now" were
  removed. Watering is now something you **log** ("I watered it"), which marks the chart and resets the
  prediction's drying leg.
- Removed humidity (no sensor), weather (it was generated) and battery/RSSI (the node doesn't report them),
  rather than showing invented values.
- Kept growth photos (real images you pick) but dropped the fabricated height and leaf counts.
- Prediction is regression-only. It says "Learning…" until about an hour of drying data exists, instead of
  falling back to a made-up model.
- Readings are only recorded while the app is open, because the ESP32 keeps no history. Have the node log
  or push to a server if gaps matter.

**Verified:** `tsc` clean, lint has no errors, and `npx tsx src/domain/insights.check.ts` passes. The web
build was clicked through in Chrome against a fake ESP32 serving the same JSON: a bad address showed an
error; a good one showed the live values; after adding the plant, the tank and light alerts appeared, it
survived a reload, and stopping the fake node raised the "not responding" alert. All tabs rendered with no
console errors. Not tested against the real ESP32 (not reachable from the Mac's network).

## 2026-10-09 — Pop-up notification for every alert

**Prompt:** "whenever a alert is issued give a pop notification"

- Added `expo-notifications` (~0.32.17, via `npx expo install`) and `src/components/alert-notifier.tsx`, mounted
  inside `GardenProvider` in `src/app/_layout.tsx`. It recomputes `buildAlerts` on every poll and fires a local
  system notification for each new alert. A banner shows even while the app is open. Tapping it opens that plant.
- It asks for notification permission on first launch.
- **Decisions:**
  - Chose system notifications over an in-app toast, so the banner also shows when you're in another app,
    as long as PlantNet is still running.
  - An alert pops again if its level rises (warning → critical), because the level is part of the key.
  - A cleared alert that comes back within 30 min stays silent, so soil hovering at a threshold doesn't spam.
  - Alerts already active when the app starts pop once on launch.
  - Skipped on web.
- **Limit:** iOS suspends the app soon after it goes to the background, so nothing pops while it's closed. That
  would need the ESP32 or a server to send push notifications.
- Verified: `tsc` clean, no lint errors, iOS bundle builds. Not yet tried on the phone.

## 2026-10-09 — Repeating notifications for soil, tank and temperature

**Prompt:** "the notification should come everytime the threshold is reached for temp not only once and for
water level and soil moisture every 5s a notification is sent if it is below threshold"

- `src/components/alert-notifier.tsx`: replaced the per-poll effect with a 1 s tick that reads the latest alerts.
  - **Soil dry** (below the plant's lower bound) and **tank low** (below 18%) now notify every 5 s for as long
    as they last.
  - **Temperature** outside the species range notifies on every crossing. The 30-minute cooldown no longer
    applies to it.
  - All other alerts (offline, waterlogged, light sensor, feeding) keep the old rule: once when they start,
    with a 30-minute cooldown.
- **Decisions:**
  - Used a 1 s tick instead of the 2 s poll, so repeats land at 5 s rather than 6 s.
  - Repeats stop while that plant's ESP32 is offline, so you're not paged every 5 s about stale values. The
    offline alert covers that case.
  - Each alert reuses one notification identifier, so repeats replace each other in Notification Centre
    instead of stacking hundreds.
  - Temperature has no hysteresis, as asked. A reading sitting right on the edge of the range can pop
    several times as it wobbles.
- Verified: `tsc` clean, no lint errors.

## 2026-10-09 — Temperature upper limit fixed at 29 °C

**Prompt:** "the limit for temp is 29"

- `src/domain/insights.ts`: added `TEMP_MAX_C = 29` and `tempRange(speciesId)`, which returns the species' minimum
  and 29 °C as the maximum. Every temperature check now goes through it: the alert (and so the notification on
  each crossing), the health score, the weekly health, the plant tiles, the Trends band, the analytics band,
  the onboarding care plan, and the plant's "Temp limit" row.
- **Decision:** read "the limit" as the upper limit, applied to every plant. Before this, each species had its
  own maximum, from 26 to 34 °C (Monstera was already 29). The lower limit stays per species. A per-plant
  editable limit, like the soil band, was the alternative; I didn't build it because one global limit was
  what was asked for.
- Verified: `tsc` clean, no lint errors, insights self-check passes.

## 2026-10-09 — Light sensor stuck at 0: firmware re-arm fix, plus an on-site light range

**Prompts:** "the light sensor is showing 0 value", then "look at the default values and make the min max
according to that" (clarified: the app's light range was 8k–60k, but the sensor reads 71 in a normal room and
12k under a flashlight).

- **Diagnosis:** the BH1750 answered every read but always returned 0. It only measures after a mode command,
  and the firmware sent that only at boot and after a failed read. The sensor had lost power during the rewiring
  and came back idle, and since reads then succeeded, nothing re-armed it. Resetting the ESP32 over USB (RTS
  pulse) brought it straight back to 75 lux, which confirmed it.
- **Firmware** (`hardware/plantnet_node/plantnet_node.ino`): `readLux()` now re-arms the sensor after every
  successful read. Compiled and flashed with the Arduino IDE's bundled `arduino-cli`
  (`esp32:esp32:esp32doit-devkit-v1`, `/dev/cu.usbserial-0001`). After flashing it reads 71.67 lux in the room.
- **App** (`src/domain/insights.ts`): added `LUX_RANGE = 50–12,000 lux`, used for every plant in the health score,
  "Not enough light" headline, plant tile, Trends band, analytics band and heat-map scale, care plan, and Care
  tab. Each species' daylight range (200–60k) no longer applies.
- **Decisions:**
  - Bounds come from the user's measurements: 50 lux sits just below the 71 lux room, and 12k is the flashlight.
  - One global range, like the 29 °C temperature limit, rather than per species, because the per-species
    values were outdoor figures this indoor sensor never reaches.
  - No light alert or notification added; it wasn't asked for. Light still feeds the health score.
- Verified: `tsc` clean, no lint errors, insights self-check passes, live readings confirmed over Wi-Fi.

## 2026-10-09 — Notification when light goes out of range

**Prompt:** "add a notification when light goes out of range"

- `src/domain/insights.ts`: new `light_<plant>` alert (warning) when the reading is below or above `LUX_RANGE`
  (50–12,000 lux). The title says "too dark" or "too bright" with the lux value. It doesn't fire while the sensor
  is missing (the "not answering" alert covers that).
- `src/components/alert-notifier.tsx`: light joins temperature in the "every crossing" group. It pops each time
  the reading leaves the range, with no cooldown and no 5 s repeat.
- `src/domain/insights.check.ts`: added checks that 20 and 15,000 lux alert and 71 lux doesn't.
- **Decisions:**
  - Treated light like temperature (a notification on every crossing), as the user asked for temperature
    earlier, rather than repeating every 5 s like soil and tank.
  - No time-of-day exception: turning the room light off at night drops below 50 lux and will notify. Left
    as is, since that's what "out of range" means; quiet hours can be added if wanted.
- Verified: `tsc` clean, no lint errors, self-check passes.

## 2026-10-09 — Soil and reservoir notifications every 10 s

**Prompt:** "and also the notification for the reservoir and soil moisture should be every 10s"

- `src/components/alert-notifier.tsx`: `REPEAT_MS` 5000 → 10_000 (and the matching comments). Dry soil and a low
  reservoir now repeat every 10 s while below threshold. Everything else is unchanged.
- Verified: `tsc` clean.

## 2026-10-25 — Wiring reference page

**Prompts:** "make a html with the connections and like make a good diagram so i can just look and connect", then "open it on my browser"

- Wrote a single-page wiring guide (diagram + tick-off checklist + TMP36 leg view + pre-power checks) and opened it in the
  browser. It lives in the session scratchpad, not the repo: saving it to `hardware/wiring.html` was declined.
- **Decisions:**
  - Took the connections from this log, since there are no earlier conversation transcripts on disk, and checked them
    against the pin constants in `plantnet_node.ino`.
  - TMP36 GND is drawn going straight to the ESP32 GND next to VIN (what fixed the stuck readings), not to the bottom − rail
    the README shows.
  - Dropped the top − to bottom − rail jumper, since nothing uses the bottom − rail now: 17 jumpers instead of 18.
  - Tick-offs are saved in the browser (localStorage) so a reload keeps progress.
- README still shows the old TMP36 GND row and 18 jumpers; not changed.

## 2026-10-25 — Wiring page redone for an Arduino Uno

**Prompt:** "we have a arduino not a esp 32 reframe the connections"

- Rewrote the scratchpad wiring page for an Arduino Uno (assumed: not stated which Arduino) and reopened it.
- **Connections (16 jumpers):** Uno 5V → + rail, Uno GND → − rail. Soil VCC/GND → rails, AO → A0. Water +/− → rails,
  S → A1. TMP36 +VS → + rail, VOUT → A2, GND → − rail. BH1750 VCC/GND/ADDR → rails, SDA → A4, SCL → A5.
- **Decisions:**
  - Everything on 5 V and one rail pair: the Uno's ADC reads against 5 V, so the sensors get their full range, and the
    separate 3.3 V / 5 V rails aren't needed. The BH1750 (GY-302) board has its own regulator and takes 5 V.
  - TMP36 GND goes to the − rail this time, with a note to move it to the Uno's spare GND if readings stick at maximum.
  - A0/A1/A2 in sensor order; A4/A5 because they're the Uno's I2C pins.
- **Not done / open:** the Uno has no Wi-Fi, so the app's HTTP polling can't reach it, and `plantnet_node.ino` is
  ESP32-only. No Uno sketch was written. Earlier entries show a real ESP32 was flashed and online, so the user may have both.
