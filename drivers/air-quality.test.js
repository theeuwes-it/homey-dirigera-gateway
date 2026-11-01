'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

// The SDK is provided by Homey at runtime. Keep gateway/network access outside
// these tests, while exercising the real app, base classes, driver and device.
const sdk = { App: class {}, Driver: class {}, Device: class {} };
const originalLoad = Module._load;
let App;
let Driver;
let Device;
let loadError;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return sdk;
    if (request === 'dirigera-simple') return {};
    return originalLoad.call(this, request, ...args);
  };
  App = require('../app');
  try {
    Driver = require('./air-quality-sensor/driver');
    Device = require('./air-quality-sensor/device');
  } catch (error) {
    loadError = error;
  }
} finally {
  Module._load = originalLoad;
}

// Sanitized shape read from a real ALPSTUGA via this app's getDevices API.
function alpstuga(overrides = {}) {
  return {
    id: 'alpstuga_1',
    type: 'sensor',
    deviceType: 'environmentSensor',
    isReachable: true,
    attributes: {
      model: 'ALPSTUGA air quality monitor',
      productCode: 'E2495',
      customName: 'Office air',
      currentTemperature: 13.8100004196167,
      currentRH: 60,
      currentCO2: 413,
      currentPM25: 0,
    },
    capabilities: { canSend: [], canReceive: ['isOn', 'customName', 'windowOpen'] },
    ...overrides,
  };
}

function translate(language, key) {
  const value = (locale) => key.split('.').reduce((current, part) => current && current[part], locale);
  const filename = path.join(__dirname, '..', 'locales', `${language}.json`);
  const locale = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {};
  return value(locale) || value(require('../locales/en.json')) || key;
}

function driverFor(devices, connected = true, language = 'en') {
  assert.ok(Driver, `ALPSTUGA driver must load: ${loadError}`);
  const driver = new Driver();
  driver.homey = { __: (key) => translate(language, key), app: {
    isGatewayConnected: () => connected,
    getDevices: async () => devices,
  } };
  return driver;
}

function deviceFor(sensor = alpstuga(), language = 'en') {
  assert.ok(Device, `ALPSTUGA device must load: ${loadError}`);
  const device = new Device();
  const readings = {};
  const errors = [];
  device.getData = () => ({ id: 'alpstuga_1' });
  device.getName = () => 'Office air';
  device.hasCapability = (id) => ['measure_co2', 'measure_pm25', 'measure_temperature', 'measure_humidity'].includes(id);
  device.setCapabilityValue = async (id, value) => { readings[id] = value; };
  device.setAvailable = async () => { device.available = true; };
  device.setUnavailable = async (message) => {
    device.available = false;
    device.unavailableMessage = message;
  };
  device.setSettings = async (settings) => { device.settings = settings; };
  device.error = (error) => { errors.push(error); };
  device.log = () => {};
  device.homey = { __: (key) => translate(language, key), app: { getDevice: async () => sensor } };
  return { device, readings, errors };
}

test('ALPSTUGA pairs with all four measurements even though canReceive lists only writable attributes', async () => {
  const list = await driverFor([alpstuga()]).onPairListDevices();
  assert.equal(list.length, 1);
  assert.equal(list[0].data.id, 'alpstuga_1');
  assert.equal(list[0].name, 'Office air');
  assert.deepEqual(list[0].capabilities, ['measure_co2', 'measure_pm25', 'measure_temperature', 'measure_humidity']);
});

test('pairing excludes unrelated environment sensors and accepts ALPSTUGA by model or product code', async () => {
  const devices = [
    alpstuga({ id: 'vindstyrka', attributes: { model: 'VINDSTYRKA', productCode: 'E2112' } }),
    alpstuga({ id: 'timmerflotte', attributes: { model: 'TIMMERFLOTTE', productCode: 'E2314' } }),
    alpstuga({ id: 'product', attributes: { productCode: 'E2495', customName: 'A' } }),
    alpstuga({ id: 'model', attributes: { model: 'ALPSTUGA air quality monitor', customName: '' } }),
    { id: 'unknown', deviceType: 'environmentSensor' },
    alpstuga({ id: 'light', deviceType: 'light' }),
  ];
  const list = await driverFor(devices).onPairListDevices();
  assert.deepEqual(list.map((item) => item.data.id), ['product', 'model']);
  assert.equal(list[1].name, 'ALPSTUGA air quality monitor');
});

test('pairing uses relationId when present and lists a physical ALPSTUGA only once', async () => {
  const list = await driverFor([
    alpstuga({ id: 'monitor_1', relationId: 'monitor' }),
    alpstuga({ id: 'monitor_2', relationId: 'monitor' }),
  ]).onPairListDevices();
  assert.equal(list.length, 1);
  assert.equal(list[0].data.id, 'monitor');
});

test('pairing gives setup guidance when the gateway is not configured', async () => {
  await assert.rejects(driverFor([], false).onPairListDevices(), /Settings/);
});

test('Swedish users receive Swedish gateway setup guidance', async () => {
  await assert.rejects(driverFor([], false, 'sv').onPairListDevices(), /Inställningar.*Appar/);
});

test('offline messages use the selected Homey language', async () => {
  const swedish = deviceFor(null, 'sv').device;
  await swedish.onInit();
  assert.equal(swedish.unavailableMessage, 'Enheten är tillfälligt otillgänglig.');
  const english = deviceFor(null, 'en').device;
  await english.onInit();
  assert.equal(english.unavailableMessage, 'The device is temporarily unavailable.');
});

test('initialization loads all four readings and diagnostic settings', async () => {
  const { device, readings } = deviceFor();
  await device.onInit();
  assert.deepEqual(readings, {
    measure_co2: 413, measure_pm25: 0,
    measure_temperature: 13.8100004196167, measure_humidity: 60,
  });
  assert.equal(device.available, true);
  assert.equal(JSON.parse(device.settings.attributes).productCode, 'E2495');
});

test('live updates preserve zero readings and negative temperatures', async () => {
  const { device, readings } = deviceFor();
  await device.updateCapabilities(alpstuga({ attributes: {
    currentCO2: 0, currentPM25: 0, currentTemperature: -2.5, currentRH: 0,
  } }));
  assert.deepEqual(readings, {
    measure_co2: 0, measure_pm25: 0, measure_temperature: -2.5, measure_humidity: 0,
  });
});

test('missing, null, string and non-finite readings never replace valid readings', async () => {
  const { device, readings } = deviceFor();
  await device.updateCapabilities(alpstuga());
  await device.updateCapabilities(alpstuga({ attributes: {
    currentCO2: null, currentPM25: 'bad', currentTemperature: NaN, currentRH: Infinity,
  } }));
  await device.updateCapabilities(alpstuga({ attributes: {} }));
  assert.deepEqual(readings, {
    measure_co2: 413, measure_pm25: 0,
    measure_temperature: 13.8100004196167, measure_humidity: 60,
  });
});

test('absent Homey capabilities are skipped', async () => {
  const { device, readings } = deviceFor();
  device.hasCapability = (id) => id === 'measure_co2';
  await device.updateCapabilities(alpstuga());
  assert.deepEqual(readings, { measure_co2: 413 });
});

test('an offline or missing sensor becomes unavailable and recovers on the next valid update', async () => {
  const { device } = deviceFor(null);
  await device.onInit();
  assert.equal(device.available, false);
  await device.updateCapabilities(alpstuga());
  assert.equal(device.available, true);
  await device.updateCapabilities(alpstuga({ isReachable: false }));
  assert.equal(device.available, false);
  await device.updateCapabilities(null);
  assert.equal(device.available, false);
});

test('a rejected capability update is logged without blocking other measurements', async () => {
  const { device, readings, errors } = deviceFor();
  const write = device.setCapabilityValue;
  device.setCapabilityValue = async (id, value) => {
    if (id === 'measure_co2') throw new Error('Write failed');
    return write(id, value);
  };
  await device.updateCapabilities(alpstuga());
  assert.equal(errors.length, 1);
  assert.equal(readings.measure_pm25, 0);
  assert.equal(readings.measure_humidity, 60);
});

test('environmentSensor events route to the new driver while existing types keep their drivers', () => {
  const app = new App();
  app.homey = { drivers: { getDriver: (id) => id } };
  assert.equal(app.getDriverForType('sensor', 'environmentSensor'), 'air-quality-sensor');
  assert.equal(app.getDriverForType('sensor', 'motionSensor'), 'motion-sensor');
  assert.equal(app.getDriverForType('sensor', 'occupancySensor'), 'motion-sensor');
  assert.equal(app.getDriverForType('sensor', 'openCloseSensor'), 'door-window-sensor');
  assert.equal(app.getDriverForType('light', 'light'), 'light');
  assert.equal(app.getDriverForType('outlet', 'outlet'), 'outlet');
  assert.equal(app.getDriverForType('blinds', 'blinds'), 'roller-blind');
  assert.equal(app.getDriverForType('unknown', 'unknown'), null);
});

test('a real ALPSTUGA endpoint event finds the paired Homey device', () => {
  const app = new App();
  const paired = { getData: () => ({ id: 'alpstuga_1' }) };
  app.homey = { drivers: { getDriver: (driverId) => {
    assert.equal(driverId, 'air-quality-sensor');
    return { getDevice: (data) => {
      assert.deepEqual(data, { id: 'alpstuga_1' });
      return paired;
    } };
  } } };
  assert.equal(app.getDeviceFromUpdate({ data: alpstuga() }), paired);
});
