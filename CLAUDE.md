# CLAUDE.md

Homey (SDK v3, local platform) app that connects Homey to an IKEA DIRIGERA gateway. App id `com.theeuwes-it.ikea.dirigera`. Plain CommonJS JavaScript, no build step besides Homey Compose.

## Commands

```bash
node --test                 # unit tests (node:test + node:assert/strict), *.test.js files
homey app run               # run on a Homey for development (Homey CLI is installed globally)
homey app validate          # validate manifest / compose files
homey app version patch     # bump version + changelog (see Releasing)
```

`npm run lint` exists but there is no eslint config in the repo; don't rely on it.

## Debugging

- `homey app run` keeps the app attached to the terminal and streams its `this.log` / `this.error` output. On a Homey Pro (2023) it runs the app in Docker on the local machine by default; use `homey app run --remote` to run it on the Homey itself.
- Enable **Debug logging** on the app's settings page (setting `debugLogging`) to log every websocket update from the gateway, the full device list on each fetch, and every value sent to the gateway.
- Each paired device's advanced settings show the raw DIRIGERA `capabilities` / `attributes` JSON (written by `DirigeraDevice#updateSettings`) – use it to check what a device actually reports.

## Architecture

- `app.js` – `IkeaDirigeraGatewayApp`. Owns the single `Dirigera` client from the `dirigera-simple` library (a fork: `github.com/theeuwes-it/dirigera-simple`, source in `node_modules/dirigera-simple/src/Dirigera.js`).
  - `connect()` creates the client from settings `ipAddress` / `accessToken` and starts the websocket update listener. Reconnects automatically (debounced 2s) when those settings change.
  - Update flow: websocket event → `getDeviceFromUpdate()` → `getDriverForType(type, deviceType)` maps the DIRIGERA type to a driver id → finds the Homey device by id (falls back to the part before `_` for multi-endpoint devices) → re-fetches the **full device list** (`getDevice(id)`) → `device.updateCapabilities(newStatus)`.
  - `getDevice(id)` uses `Utils.selectDirigeraDevice`, which matches on `id` **or** `relationId` and merges endpoints (see MYGGSPRAY below).
  - Pairing/auth helpers: `discover()`, `startAuthenticationProcess()`, `getAccessToken()` (wrap `Dirigera.Discover` / `Dirigera.AuthenticateV2`).
- `api.js` + `api` section of `.homeycompose/app.json` – web API used by the settings page (`settings/index.html`, strings in `locales/en.json`).
- `utils.js` – pure helpers (sorting pair lists, `selectDirigeraDevice`). Keep logic here or in small modules so it's unit-testable without Homey.
- `drivers/DirigeraDriver.js` – base driver; `getIdFromDevice()` uses `relationId` when present, else `id`. That value becomes the Homey device's `data.id`.
- `drivers/DirigeraDevice.js` – base device; `updateSettings()` dumps raw capabilities/attributes JSON into the read-only "advanced" settings (handy for debugging user reports), `updateCapabilities()` is overridden per driver, `isDebugLoggingEnabled()`.

### Drivers

| Driver | DIRIGERA `type` / `deviceType` | Homey capabilities |
|---|---|---|
| `light` | `light` | onoff, dim, light_temperature, light_hue, light_saturation, light_mode |
| `outlet` | `outlet`, plus `electricalSensor` endpoint | onoff, measure_power/voltage/current, meter_power |
| `roller-blind` | `blinds` | windowcoverings_set, windowcoverings_closed, measure_battery, alarm_battery |
| `motion-sensor` | `sensor`/`motionSensor`, `occupancySensor`, `lightSensor` | alarm_motion, measure_luminance, measure_battery |
| `door-window-sensor` | `sensor`/`openCloseSensor` | alarm_contact, measure_battery |

Each driver dir has: `driver.js` (`onPairListDevices` filters the gateway device list and builds `{data:{id}, capabilities, name, store?}`), `device.js` (`onInit` → fetch device, `updateSettings`, `updateCapabilities`, register capability listeners), `driver.compose.json`, `driver.settings.compose.json`, `assets/images/`.

Patterns used in devices:
- Capabilities are only added at pair time if the device's `capabilities.canReceive` includes the matching DIRIGERA attribute, so always guard with `this.hasCapability(...)`.
- Write to the gateway with `this.homey.app.getDirigera().setAttribute(id, { attr: value })`.
- `setCapabilityValue(...).catch(this.error)` – never let a capability update throw.
- `isReachable` → `setAvailable()` / `setUnavailable('(temporary) unavailable')`.
- Lights and blinds use `registerMultipleCapabilityListener` with a 100 ms debounce (hue + saturation must be sent together).
- When adding a new capability to an existing driver, also `addCapability` in `onInit` for already-paired devices (see `outlet/device.js`).

### Device-specific gotchas

- **Unit conversions**: DIRIGERA `lightLevel` 0–100 ↔ Homey `dim` 0–1; `colorHue` 0–360 ↔ `light_hue` 0–1; `light_temperature` 0 = cool / 1 = warm, mapped linearly between `colorTemperatureMin/Max` Kelvin.
- **Blinds**: DIRIGERA level 0 = open, 100 = closed; Homey `windowcoverings_set` 1 = open. All mapping lives in `drivers/roller-blind/position.js` (tested); the per-device `swap_up_down` setting inverts it. Don't put mapping logic in `device.js`.
- **Multi-endpoint devices share a `relationId`** and arrive as separate gateway devices with ids like `<relationId>_1`:
  - GRILLPLATS outlet: `outlet` endpoint + `electricalSensor` endpoint (energy data). Outlet writes go to the real endpoint id (`_realId`), not the relationId. Energy values also polled every 60s as a fallback.
  - MYGGSPRAY (Matter): `occupancySensor` (isDetected) + `lightSensor` (illuminance). `selectDirigeraDevice` prefers the occupancy endpoint and overlays illuminance. Matter illuminance is raw log-scale (`10000*log10(lux)+1`) and converted in `motion-sensor/device.js#toLux`, gated by the `matterIlluminance` store flag. Vallhorn (Zigbee) already reports lux.
- Users reporting issues: ask them to enable debug logging in app settings – it logs every websocket update and the full device list – and/or share the device's advanced settings JSON.

## Adding a new device type

1. Create `drivers/<id>/` with `driver.js` extending `DirigeraDriver`, `device.js` extending `DirigeraDevice`, `driver.compose.json`, `driver.settings.compose.json` (copy the capabilities/attributes textarea settings), and `assets/images/{small,large}.png`.
2. Map the DIRIGERA `type`/`deviceType` to the driver id in `app.js#getDriverForType`, otherwise realtime updates won't reach it.
3. If it's split into multiple endpoints, extend `Utils.selectDirigeraDevice` (and add a test in `utils.test.js`).
4. Put pure conversion logic in a small module with a `*.test.js` next to it.

## Files to edit vs generated

- Edit `.homeycompose/app.json` and `drivers/*/driver*.compose.json`. **`app.json` is generated** by Homey Compose (`homey app build/run/validate`) – don't hand-edit it, but do commit the regenerated version.
- `.homeybuild/` and `env.json` are gitignored.

## Releasing

Version bumps are a separate commit (`Bump version to vX.Y.Z`) updating `.homeycompose/app.json` `version` (plus regenerated `app.json`) and adding an entry to `.homeychangelog.json` (short user-facing English text). `package.json` version is not kept in sync.

## Conventions

- Match existing style: 2-space indent, `'use strict'`, CommonJS, mixed quote styles exist – follow the file you're editing; don't reformat unrelated code.
- Commit messages historically use `[FIX] ...` / `[ADD] ...` prefixes or plain imperative sentences. Keep PRs minimal and focused on one issue.
