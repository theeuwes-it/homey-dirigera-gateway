'use strict';

const { randomUUID } = require('crypto');
const { isIP } = require('net');
const Homey = require('homey');
const Dirigera = require('dirigera-simple');
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
    for (const hub of hubs) this.connectHub(hub);
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
    this.hubs.set(hub.id, connection);
    if (previous) previous.close();

    connection.listen(
      message => this.handleUpdate(connection, message),
      () => this.refreshHubDevices(connection).catch(err => this.error(hub.name, err)),
      () => this.markHubUnavailable(connection).catch(err => this.error(hub.name, err)),
    );
  }

  getHubs() {
    return Array.from(this.hubs.values(), ({ hub }) => ({
      id: hub.id,
      name: hub.name,
      ipAddress: hub.ipAddress,
    }));
  }

  saveHubs(hubs) {
    this.homey.settings.set(HUBS_SETTING, hubs);
  }

  async removeHub(id) {
    const connection = this.getHubConnection(id);
    const devices = this.getHubDevices(id);
    this.saveHubs(Array.from(this.hubs.values(), entry => entry.hub).filter(hub => hub.id !== id));
    this.hubs.delete(id);
    connection.close();
    await Promise.all(devices.map(device => device.setUnavailable('DIRIGERA hub removed')));
    return this.getHubs();
  }

  async startAuthenticationProcess({ hub_id, ip_address, name }) {
    const ipAddress = (typeof ip_address === 'string' ? ip_address : '').trim();
    if (isIP(ipAddress) !== 4) throw new Error('Enter a valid IPv4 address for the DIRIGERA hub');
    const previous = hub_id ? this.getHubConnection(hub_id) : null;
    const hubName = (typeof name === 'string' ? name : '').trim() || ipAddress;
    const id = hub_id || randomUUID();
    if (this.findHubByAddress(ipAddress, id)) {
      throw new Error('A DIRIGERA hub with this IP address is already configured');
    }
    if (Array.from(this.authentications.values()).some(session => (
      session.hub.id === id || session.hub.ipAddress === ipAddress
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
    if (!session || !session.credentials || session.finishing) {
      throw new Error('Start a new DIRIGERA authentication session');
    }
    session.finishing = true;
    this.homey.clearTimeout(session.timer);
    const { hub, previous } = session;
    try {
      const accessToken = await getAccessToken(hub.ipAddress, session.credentials);
      if (this.findHubByAddress(hub.ipAddress, hub.id)
          || (previous && this.hubs.get(hub.id) !== previous)) {
        throw new Error('Hub settings changed during authentication. Try again.');
      }
      const updated = { ...hub, accessToken };
      const otherHubs = Array.from(this.hubs.values(), entry => entry.hub).filter(entry => entry.id !== hub.id);
      this.saveHubs([...otherHubs, updated]);
      this.connectHub(updated);
      return this.getHubs();
    } finally {
      this.authentications.delete(sessionId);
    }
  }

  findHubByAddress(ipAddress, exceptId) {
    return Array.from(this.hubs.values()).find(({ hub }) => hub.ipAddress === ipAddress && hub.id !== exceptId);
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
    const connections = [...this.hubs.values()];
    if (connections.length === 0) {
      throw new Error('First go to Settings -> Apps -> IKEA DIRIGERA Gateway to configure a hub.');
    }
    const results = await Promise.allSettled(connections.map(async connection => {
      const { id, name } = connection.hub;
      const devices = await connection.getDevices();
      if (this.hubs.get(id) !== connection) return [];
      return devices.map(device => ({ ...device, hubId: id, hubName: connections.length > 1 ? name : null }));
    }));
    const available = results.filter(result => result.status === 'fulfilled');
    if (available.length === 0) throw results[0].reason;
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

  async discover(timeout = 10000) {
    return new Promise((resolve) => {
      let discover = null;
      let timer = null;
      const finish = (data) => {
        clearTimeout(timer);
        if (discover && discover.mdns) {
          try {
            discover.mdns.destroy();
          } catch (e) {
            // ignore
          }
        }
        resolve(data);
      };
      try {
        discover = new Dirigera.Discover((data) => {
          finish(data);
        });
        // mdns-server emits 'error' when it can't bind to an interface (e.g. EADDRNOTAVAIL on an
        // IPv6 address). Without a listener that crashes the app.
        discover.mdns.on('error', (err) => {
          this.error('Discovery error', err);
          finish(null);
        });
        discover.mdns.on('warning', (err) => {
          this.log('Discovery warning', err && err.message);
        });
      } catch (err) {
        this.error('Discovery failed', err);
        finish(null);
        return;
      }
      timer = setTimeout(() => finish(null), timeout);
    });
  }

}

module.exports = IkeaDirigeraGatewayApp;
