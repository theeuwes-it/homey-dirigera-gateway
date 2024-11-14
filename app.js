'use strict';

const Homey = require('homey');
const Dirigera = require('dirigera-simple');

class IkeaDirigeraGatewayApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('Ikea Dirigera Gateway App has been initialized');

    this._gatewayConnected = false;

    await (async (args, callback) => {
      try {
        await this.connect();
      } catch (err) {
        this.log(err.message);
      }
    })();
  }

  async connect() {
    this._gatewayConnected = false;
    if (this._dirigera != null) {
      this._dirigera.destroy();
    }
    this._dirigera = new Dirigera.Dirigera(this.homey.settings.get('ipAddress'), this.homey.settings.get('accessToken'));
    this._gatewayConnected = true;
    this.log('Connected to DIRIGERA gateway');
  }

  isGatewayConnected() {
    return this._gatewayConnected;
  }

  getDirigera() {
    return this._dirigera;
  }

  async getDevices() {
    return new Promise((resolve) => {
      this._dirigera.getDeviceList((list) => {
        resolve(list);
      });
    });
  }

  async getDevice(id) {
    const devices = await this.getDevices();
    for (const device of devices) {
      if (device.id === id) {
        return device;
      }
    }
    return null;
  }

  async discover() {
    return new Promise((resolve) => {
      // eslint-disable-next-line no-new
      new Dirigera.Discover((data) => {
        resolve(data);
      });
    });
  }

  async authenticate(ipAddress) {
    return new Promise((resolve) => {
      // eslint-disable-next-line no-new
      new Dirigera.Authenticate(ipAddress, (data) => {
        resolve(data);
      });
    });
  }

}
module.exports = IkeaDirigeraGatewayApp;
