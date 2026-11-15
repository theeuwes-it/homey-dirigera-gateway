'use strict';

const { randomUUID } = require('crypto');
const { isIP } = require('net');
const Homey = require('homey');
const createMdns = require('mdns-server');
const DirigeraDevice = require('./drivers/DirigeraDevice');
const HubConnection = require('./lib/hub-connection');
const { startAuthentication, getAccessToken } = require('./lib/hub-authentication');
const Utils = require('./utils');

const LEGACY_HUB_ID = 'legacy';
const HUBS_SETTING = 'hubs';

class IkeaDirigeraGatewayApp extends Homey.App {

  async onInit() {
    this.hubs = new Map();
    this.authentications = new Map();

    const saved = this.homey.settings.get(HUBS_SETTING);
    const ipAddress = this.homey.settings.get('ipAddress');
    const accessToken = this.homey.settings.get('accessToken');
    const hubs = Array.isArray(saved) ? saved : [];
    if (!Array.isArray(saved) && ipAddress && accessToken) {
      hubs.push({ id: LEGACY_HUB_ID, name: 'DIRIGERA', ipAddress, accessToken });
      this.homey.settings.set(HUBS_SETTING, hubs);
    }
    this.configuredHubs = new Map(hubs.map(hub => [hub.id, hub]));
    for (const hub of this.configuredHubs.values()) {
      try {
        this.connectHub(hub);
      } catch (err) {
        this.error('Could not start DIRIGERA connection', hub.name, err);
      }
    }
  }

  async onUninit() {
    const connections = [...this.hubs.values()];
    this.hubs.clear();
    for (const connection of connections) connection.close();
    for (const session of this.authentications.values()) this.homey.clearTimeout(session.timer);
    this.authentications.clear();
  }

  connectHub(hub) {
    const previous = this.hubs.get(hub.id);
    const connection = new HubConnection(this.homey, hub);
    try {
      connection.listen(
        message => this.handleUpdate(connection, message),
        () => this.refreshHubDevices(connection).catch(err => this.error(hub.name, err)),
        () => this.markHubUnavailable(connection).catch(err => this.error(hub.name, err)),
      );
    } catch (err) {
      connection.close();
      throw err;
    }
    this.hubs.set(hub.id, connection);
    if (previous) previous.close();
  }

  getHubs() {
    return Array.from(this.configuredHubs.values(), hub => ({
      id: hub.id,
      name: hub.name,
      ipAddress: hub.ipAddress,
    }));
  }

  saveHubs(hubs) {
    this.homey.settings.set(HUBS_SETTING, hubs);
    this.configuredHubs = new Map(hubs.map(hub => [hub.id, hub]));
  }

  getConfiguredHub(id) {
    const hub = this.configuredHubs.get(id);
    if (!hub) throw new Error('This DIRIGERA hub is not configured');
    return hub;
  }

  renameHub(id, name) {
    const hub = this.getConfiguredHub(id);
    const hubName = typeof name === 'string' ? name.trim() : '';
    if (!hubName) throw new Error('Enter a name for the DIRIGERA hub');
    const updated = { ...hub, name: hubName };
    this.saveHubs(Array.from(this.configuredHubs.values(), entry => entry.id === id ? updated : entry));
    const connection = this.hubs.get(id);
    if (connection) connection.hub = updated;
    return this.getHubs();
  }

  async removeHub(id) {
    this.getConfiguredHub(id);
    const devices = this.getHubDevices(id);
    const connection = this.hubs.get(id);
    this.saveHubs(Array.from(this.configuredHubs.values()).filter(hub => hub.id !== id));
    this.hubs.delete(id);
    connection?.close();
    for (const device of devices) {
      Promise.resolve()
        .then(() => device.setUnavailable('DIRIGERA hub removed'))
        .catch(err => this.error('Could not mark DIRIGERA device unavailable', err));
    }
    return this.getHubs();
  }

  async startAuthenticationProcess({ hub_id, ip_address, name }) {
    const ipAddress = (typeof ip_address === 'string' ? ip_address : '').trim();
    if (isIP(ipAddress) !== 4) throw new Error('Enter a valid IPv4 address for the DIRIGERA hub');
    const previous = hub_id ? this.getConfiguredHub(hub_id) : null;
    const hubName = (typeof name === 'string' ? name : '').trim() || ipAddress;
    const id = hub_id || randomUUID();
    if (this.findHubByAddress(ipAddress, id)) {
      throw new Error('A DIRIGERA hub with this IP address is already configured');
    }
    if (Array.from(this.authentications.values()).some(session => (
      !session.completed && (session.hub.id === id || session.hub.ipAddress === ipAddress)
    ))) {
      throw new Error('Authentication is already in progress for this hub');
    }

    const sessionId = randomUUID();
    const session = { hub: { id, name: hubName, ipAddress }, previous };
    this.authentications.set(sessionId, session);
    try {
      session.credentials = await startAuthentication(ipAddress);
      session.timer = this.homey.setTimeout(() => this.authentications.delete(sessionId), 90000);
      return { sessionId };
    } catch (err) {
      this.authentications.delete(sessionId);
      throw err;
    }
  }

  async finishAuthentication(sessionId) {
    const session = this.authentications.get(sessionId);
    if (!session || !session.credentials) {
      throw new Error('Start a new DIRIGERA authentication session');
    }
    // Keep the result until the session expires so a lost response can be retried.
    if (session.completed) return { hubId: session.hub.id, hubs: this.getHubs() };
    if (session.finishing) return { pending: true };
    session.finishing = true;
    const { hub, previous } = session;
    try {
      const accessToken = await getAccessToken(hub.ipAddress, session.credentials);
      if (!accessToken) return { pending: true };
      if (this.authentications.get(sessionId) !== session) {
        throw new Error('DIRIGERA authentication expired. Try again.');
      }
      if (this.findHubByAddress(hub.ipAddress, hub.id)
          || (previous && this.configuredHubs.get(hub.id) !== previous)) {
        throw new Error('Hub settings changed during authentication. Try again.');
      }
      const updated = { ...hub, accessToken };
      const hubs = [...this.configuredHubs.values()];
      if (previous) hubs[hubs.indexOf(previous)] = updated;
      else hubs.push(updated);
      this.saveHubs(hubs);
      this.connectHub(updated);
      session.completed = true;
      return { hubId: hub.id, hubs: this.getHubs() };
    } catch (err) {
      this.homey.clearTimeout(session.timer);
      this.authentications.delete(sessionId);
      throw err;
    } finally {
      session.finishing = false;
    }
  }

  findHubByAddress(ipAddress, exceptId) {
    return Array.from(this.configuredHubs.values()).find(hub => hub.ipAddress === ipAddress && hub.id !== exceptId);
  }

  getHubConnection(hubId) {
    const connection = this.hubs.get(hubId);
    if (!connection) throw new Error('This DIRIGERA hub is not configured');
    return connection;
  }

  // Already-paired Homey devices keep the original { id } data exactly.
  getHomeyDeviceId(hubId, deviceId) {
    return hubId === LEGACY_HUB_ID ? deviceId : `${hubId}:${deviceId}`;
  }

  getDeviceAddress(homeyId) {
    const separator = homeyId.indexOf(':');
    if (separator === -1) return { hubId: LEGACY_HUB_ID, deviceId: homeyId };
    return { hubId: homeyId.slice(0, separator), deviceId: homeyId.slice(separator + 1) };
  }

  getHubDevices(hubId) {
    return Object.values(this.homey.drivers.getDrivers())
      .flatMap(driver => Object.values(driver.getDevices()))
      .filter(device => device instanceof DirigeraDevice && device.getDirigeraAddress().hubId === hubId);
  }

  async markHubUnavailable(connection) {
    if (this.hubs.get(connection.hub.id) !== connection) return;
    await Promise.all(this.getHubDevices(connection.hub.id).map(device => (
      device.setUnavailable(`DIRIGERA hub ${connection.hub.name} is unavailable`)
    )));
  }

  async refreshHubDevices(connection) {
    const devices = await connection.getDevices();
    if (this.hubs.get(connection.hub.id) !== connection) return;
    await Promise.all(this.getHubDevices(connection.hub.id).map(device => {
      const { deviceId } = device.getDirigeraAddress();
      return this.updateDevice(device, devices, deviceId);
    }));
  }

  async handleUpdate(connection, message) {
    try {
      const { data } = JSON.parse(message);
      if (!data || typeof data.id !== 'string') return;
      if (this.homey.settings.get('debugLogging')) this.log('DIRIGERA update', connection.hub.name, data);
      const driver = this.getDriverForType(data.type, data.deviceType);
      if (!driver) return;
      const candidates = [data.id, data.relationId, data.id.split('_', 1)[0]];
      const device = Object.values(driver.getDevices()).find(entry => {
        const { hubId, deviceId } = entry.getDirigeraAddress();
        return hubId === connection.hub.id && candidates.includes(deviceId);
      });
      if (!device) return;
      const devices = await connection.getDevices();
      if (this.hubs.get(connection.hub.id) !== connection) return;
      await this.updateDevice(device, devices, device.getDirigeraAddress().deviceId);
    } catch (err) {
      this.error('DIRIGERA update failed', connection.hub.name, err);
    }
  }

  async updateDevice(device, devices, deviceId) {
    const status = Utils.selectDirigeraDevice(devices, deviceId);
    if (!status) {
      await device.setUnavailable('Device not found on its DIRIGERA hub');
      return;
    }
    const related = devices.filter(entry => entry.id === deviceId || entry.relationId === deviceId);
    await device.updateCapabilities(status, related);
  }

  async getPairableDevices() {
    const configured = [...this.configuredHubs.values()];
    if (configured.length === 0) {
      throw new Error('First go to Settings -> Apps -> IKEA DIRIGERA Gateway to configure a hub.');
    }
    const results = await Promise.allSettled(configured.map(async ({ id, name }) => {
      const connection = this.hubs.get(id);
      if (!connection) throw new Error(`Could not connect to DIRIGERA hub ${name}`);
      const devices = await connection.getDevices();
      if (this.hubs.get(id) !== connection) return [];
      return devices.map(device => ({ ...device, hubId: id, hubName: configured.length > 1 ? name : null }));
    }));
    const available = results.filter(result => result.status === 'fulfilled');
    if (available.length === 0) throw results[0].reason;
    results.forEach((result, index) => {
      if (result.status === 'rejected') this.error('Could not list DIRIGERA devices', configured[index].name, result.reason);
    });
    return available.flatMap(result => result.value);
  }

  getDriverForType(type, deviceType) {
    let driverId = null;
    switch (type) {
      case 'light':
        driverId = 'light';
        break;
      case 'outlet':
        driverId = 'outlet';
        break;
      case 'blinds':
        driverId = 'roller-blind';
        break;
      case 'sensor':
        if (deviceType === 'motionSensor') {
          driverId = 'motion-sensor';
        }
        if (deviceType === 'openCloseSensor') {
          driverId = 'door-window-sensor';
        }
        if (deviceType === 'environmentSensor') {
          driverId = 'air-quality-sensor';
        }
        break;
    }
    // Matter based sensors (MYGGSPRAY) are reported as an occupancySensor plus a
    // separate lightSensor, and are not always announced with the 'sensor' type.
    if (deviceType === 'electricalSensor') {
      driverId = 'outlet';
    }
    if (deviceType === 'occupancySensor' || deviceType === 'lightSensor') {
      driverId = 'motion-sensor';
    }
    if (driverId != null) {
      return this.homey.drivers.getDriver(driverId);
    }
    return null;
  }

  async discover(timeout = 4000) {
    const service = '_ihsp._tcp.local';
    const normalize = name => name.toLowerCase().replace(/\.$/, '');
    const hosts = new Set();
    const addresses = new Map();

    await new Promise((resolve, reject) => {
      const mdns = createMdns({ noInit: true });
      let finished = false;
      const timer = setTimeout(() => finish(), timeout);
      const finish = (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try {
          mdns.destroy();
        } catch (err) {
          this.error('Could not close DIRIGERA discovery', err);
        }
        if (error) reject(error);
        else resolve();
      };

      mdns.on('response', ({ answers = [], additionals = [] }) => {
        for (const record of [...answers, ...additionals]) {
          if (record.type === 'SRV' && normalize(record.name).endsWith('.' + service)) {
            hosts.add(normalize(record.data.target));
          }
          if (record.type === 'A' && isIP(record.data) === 4) {
            const host = normalize(record.name);
            if (!addresses.has(host)) addresses.set(host, new Set());
            addresses.get(host).add(record.data);
          }
        }
      });
      mdns.on('ready', () => {
        if (!finished) mdns.query([{ name: service + '.', type: 'PTR' }]);
      });
      mdns.on('error', finish);
      mdns.on('warning', err => this.log('Discovery warning', err.message));
      try {
        mdns.initServer();
      } catch (err) {
        finish(err);
      }
    });

    const found = new Set();
    for (const host of hosts) {
      for (const address of addresses.get(host) || []) {
        if (!this.findHubByAddress(address)) found.add(address);
      }
    }
    return Array.from(found).sort();
  }

}

module.exports = IkeaDirigeraGatewayApp;
