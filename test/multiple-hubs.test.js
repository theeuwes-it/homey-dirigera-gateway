'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');

class Socket {
  constructor(url) {
    this.url = url;
    this.listeners = {};
  }

  addEventListener(event, listener) {
    this.listeners[event] = listener;
  }

  close() {
    this.closed = true;
    return this.listeners.close();
  }
}

class Client {
  constructor(ipAddress) {
    this.ipAddress = ipAddress;
    this.state = {};
    this.devices = [];
    this.commands = [];
  }

  getDeviceList(callback) {
    callback(this.devices);
  }

  setAttribute(id, attributes) {
    this.commands.push({ id, attributes });
  }
}

let authenticationToken;
const load = Module._load;
Module._load = function loadMock(name, ...args) {
  if (name === './lib/hub-authentication') return {
    startAuthentication: async () => ({ code: 'code', verifier: 'verifier' }),
    getAccessToken: async () => authenticationToken,
  };
  if (name === 'homey') return { App: class {}, Device: class {}, Driver: class {} };
  if (name === 'dirigera-simple') return { Dirigera: Client };
  if (name === 'reconnecting-websocket') return Socket;
  return load.call(this, name, ...args);
};
const App = require('../app');
const Light = require('../drivers/light/device');
const LightDriver = require('../drivers/light/driver');
Module._load = load;

const otherHub = { id: 'second', name: 'Garage', ipAddress: '192.168.0.11', accessToken: 'garage-token' };

function light(isOn) {
  return {
    id: 'shared-id',
    type: 'light',
    attributes: { customName: 'Desk lamp', isOn },
    capabilities: { canReceive: ['isOn'] },
  };
}

async function createApp(settings) {
  const app = new App();
  const driver = new LightDriver();
  const devices = [];
  driver.getDevices = () => devices;
  app.homey = {
    drivers: { getDriver: () => driver, getDrivers: () => ({ light: driver }) },
    settings: { get: name => settings[name], set: (name, value) => { settings[name] = value; } },
    setTimeout, clearTimeout,
    setInterval: () => 1,
    clearInterval() {},
  };
  driver.homey = { app };
  app.error = err => { throw err; };
  await app.onInit();
  return { app, driver, devices };
}

test('polls for the action button and saves the hub only once if the response is retried', async () => {
  const settings = { hubs: [] };
  const { app } = await createApp(settings);
  const { sessionId } = await app.startAuthenticationProcess({
    ip_address: otherHub.ipAddress,
    name: otherHub.name,
  });

  authenticationToken = null;
  assert.deepEqual(await app.finishAuthentication(sessionId), { pending: true });
  assert.deepEqual(settings.hubs, []);
  authenticationToken = otherHub.accessToken;
  const result = await app.finishAuthentication(sessionId);
  const connection = app.getHubConnection(result.hubId);
  assert.equal(result.hubs[0].name, otherHub.name);
  assert.equal(result.hubs[0].accessToken, undefined);
  assert.deepEqual(await app.finishAuthentication(sessionId), result);
  assert.equal(app.getHubConnection(result.hubId), connection);
  assert.equal(settings.hubs.length, 1);
  await app.onUninit();
});

test('migrates existing settings once and keeps existing Homey device identifiers', async () => {
  const settings = { ipAddress: '192.168.0.10', accessToken: 'legacy-token' };
  const { app, driver } = await createApp(settings);
  const hub = app.getHubConnection('legacy');
  hub.client.devices = [light(false)];
  assert.deepEqual((await driver.onPairListDevices())[0].data, { id: 'shared-id' });
  assert.equal(app.getHubs()[0].accessToken, undefined);

  await app.removeHub('legacy');
  await app.onUninit();
  const restarted = await createApp(settings);
  assert.deepEqual(restarted.app.getHubs(), []);
  await restarted.app.onUninit();
});

test('saves a new hub name without changing its ID, token or connection', async () => {
  const settings = { hubs: [otherHub] };
  const { app } = await createApp(settings);
  const connection = app.getHubConnection('second');

  assert.throws(() => app.renameHub('second', ' '), /Enter a name/);
  assert.deepEqual(app.renameHub('second', ' Downstairs '), [
    { id: 'second', name: 'Downstairs', ipAddress: otherHub.ipAddress },
  ]);
  assert.equal(app.getHubConnection('second'), connection);
  assert.equal(connection.socket.closed, undefined);
  assert.deepEqual(settings.hubs, [{ ...otherHub, name: 'Downstairs' }]);
  await app.onUninit();

  const restarted = await createApp(settings);
  assert.equal(restarted.app.getHubs()[0].name, 'Downstairs');
  await restarted.app.onUninit();
});

test('routes identical IDs, events and commands to their own hubs', async () => {
  const primaryHub = { ...otherHub, id: 'legacy', name: 'Home', ipAddress: '192.168.0.10' };
  const { app, driver, devices } = await createApp({ hubs: [primaryHub, otherHub] });
  const primary = app.getHubConnection('legacy');
  const second = app.getHubConnection('second');
  primary.client.devices = [light(false)];
  second.client.devices = [light(true)];

  const paired = await driver.onPairListDevices();
  assert.deepEqual(paired.map(device => device.data.id), ['second:shared-id', 'shared-id']);
  for (const descriptor of paired) {
    const device = new Light();
    device.homey = { app };
    device.getData = () => descriptor.data;
    device.getName = () => descriptor.name;
    device.isDebugLoggingEnabled = () => false;
    device.setUnavailable = () => { device.unavailable = true; };
    device.updateCapabilities = status => { device.isOn = status.attributes.isOn; };
    device._instanceId = device.getDirigeraAddress().deviceId;
    devices.push(device);
  }
  const [garage, home] = devices;

  await app.handleUpdate(second, JSON.stringify({ data: light(true) }));
  assert.equal(garage.isOn, true);
  assert.equal(home.isOn, undefined);
  await garage._onMultipleCapabilityListener({ onoff: false });
  assert.deepEqual(second.client.commands, [{ id: 'shared-id', attributes: { isOn: false } }]);
  assert.deepEqual(primary.client.commands, []);

  await second.socket.listeners.close();
  assert.equal(garage.unavailable, true);
  assert.equal(home.unavailable, undefined);
  second.client.devices = { error: 'offline' };
  assert.deepEqual((await driver.onPairListDevices()).map(device => device.data.id), ['shared-id']);

  app.connectHub({ ...otherHub, ipAddress: '192.168.0.12' });
  assert.equal(second.socket.closed, true);
  assert.equal(primary.socket.closed, undefined);
  assert.notEqual(app.getHubConnection('second').socket.url, second.socket.url);
  await app.onUninit();
});
