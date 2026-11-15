'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

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

let failingAddress;

class Client {
  constructor(ipAddress) {
    if (ipAddress === failingAddress) throw new Error('Connection initialization failed');
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
let mdns;
const load = Module._load;
Module._load = function loadMock(name, ...args) {
  if (name === './lib/hub-authentication') return {
    startAuthentication: async () => ({ code: 'code', verifier: 'verifier' }),
    getAccessToken: async () => authenticationToken,
  };
  if (name === 'mdns-server') return () => mdns;
  if (name === 'homey') return { App: class {}, Device: class {}, Driver: class {} };
  if (name === 'dirigera-simple') return { Dirigera: Client };
  if (name === 'reconnecting-websocket') return Socket;
  return load.call(this, name, ...args);
};
const App = require('../app');
const api = require('../api');
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
  const errors = [];
  app.error = (...args) => errors.push(args);
  await app.onInit();
  return { app, driver, devices, errors };
}

test('discovers multiple new DIRIGERA addresses across mDNS packets', async () => {
  const { app } = await createApp({ hubs: [otherHub] });
  mdns = new EventEmitter();
  mdns.initServer = () => mdns.emit('ready');
  mdns.destroy = () => { mdns.closed = true; };
  const address = (name, data) => ({ name, type: 'A', data });
  const service = (name, target) => ({
    name: name + '._ihsp._tcp.local.',
    type: 'SRV',
    data: { target },
  });
  mdns.query = questions => {
    assert.deepEqual(questions, [{ name: '_ihsp._tcp.local.', type: 'PTR' }]);
    mdns.emit('response', {
      answers: [service('Garage', 'garage.local'), service('Shed', 'SHED.local.')],
      additionals: [
        address('garage.local.', otherHub.ipAddress),
        address('shed.local', '192.168.0.13'),
        address('printer.local', '192.168.0.100'),
      ],
    });
    mdns.emit('response', { answers: [
      address('shed.local', '192.168.0.13'),
      address('attic.local', '192.168.0.12'),
    ] });
    mdns.emit('response', { additionals: [service('Attic', 'attic.local')] });
  };

  assert.deepEqual(await app.discover(5), ['192.168.0.12', '192.168.0.13']);
  assert.equal(mdns.closed, true);
  await app.onUninit();
});

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

test('restores both configured hubs with their original IDs and credentials after restart', async () => {
  const settings = { ipAddress: '192.168.0.10', accessToken: 'legacy-token' };
  const { app } = await createApp(settings);
  const { sessionId } = await app.startAuthenticationProcess({
    ip_address: otherHub.ipAddress,
    name: otherHub.name,
  });
  authenticationToken = otherHub.accessToken;
  const { hubId } = await app.finishAuthentication(sessionId);
  await app.onUninit();

  const saved = JSON.parse(JSON.stringify(settings));
  const restarted = await createApp(saved);
  assert.deepEqual(restarted.app.getHubs().map(hub => hub.id), ['legacy', hubId]);
  assert.equal(restarted.app.getHubConnection(hubId).hub.accessToken, otherHub.accessToken);
  assert.equal(restarted.app.getHubConnection('legacy').hub.accessToken, 'legacy-token');
  assert.deepEqual(restarted.app.getDeviceAddress(hubId + ':shared-id'), { hubId, deviceId: 'shared-id' });
  assert.deepEqual(saved, settings);
  await restarted.app.onUninit();
});

test('retains a hub that cannot start while another hub is edited and allows re-authentication with the same ID', async () => {
  const primary = { ...otherHub, id: 'legacy', ipAddress: '192.168.0.10' };
  const settings = { hubs: [otherHub, primary] };
  failingAddress = otherHub.ipAddress;
  const { app, errors } = await createApp(settings);
  failingAddress = undefined;

  assert.deepEqual(app.getHubs().map(hub => hub.id), ['second', 'legacy']);
  assert.equal(errors[0][1], otherHub.name);
  assert.ok(app.getHubConnection('legacy'));
  await app.getPairableDevices();
  assert.equal(errors[1][1], otherHub.name);
  app.renameHub('legacy', 'Beneden');
  assert.deepEqual(settings.hubs[0], otherHub);

  const { sessionId } = await app.startAuthenticationProcess({
    hub_id: otherHub.id,
    ip_address: otherHub.ipAddress,
    name: otherHub.name,
  });
  authenticationToken = 'renewed-token';
  const { hubId } = await app.finishAuthentication(sessionId);
  assert.equal(hubId, otherHub.id);
  assert.equal(settings.hubs[0].accessToken, 'renewed-token');
  assert.equal(app.getHubs()[1].name, 'Beneden');
  await app.onUninit();
});

test('returns the empty hub list before associated device updates finish', async () => {
  const settings = { hubs: [otherHub] };
  const { app, devices } = await createApp(settings);
  const connection = app.getHubConnection(otherHub.id);
  const lightDevice = new Light();
  lightDevice.homey = { app };
  lightDevice.getData = () => ({ id: otherHub.id + ':shared-id' });
  let finishUpdate;
  lightDevice.setUnavailable = () => new Promise(resolve => { finishUpdate = resolve; });
  devices.push(lightDevice);

  const result = await Promise.race([
    api.removeHub({ homey: { app }, body: { hub_id: otherHub.id } }),
    new Promise(resolve => setImmediate(() => resolve('waiting for device update'))),
  ]);

  assert.deepEqual(result, { hubs: [] });
  assert.deepEqual(settings.hubs, []);
  assert.equal(connection.socket.closed, true);
  assert.equal(typeof finishUpdate, 'function');
  finishUpdate();
  await app.onUninit();
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
