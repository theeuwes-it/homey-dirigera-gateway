'use strict';

const Homey = require('homey');
const Dirigera = require('dirigera-simple');
const DirigeraDevice = require("./drivers/DirigeraDevice");

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
        this.log(`Error: ${err.message}`);
      }
    })();
  }

  async connect() {
    this._gatewayConnected = false;
    if (this._dirigera != null) {
      this._dirigera.stopListeningForUpdates();
    }
    this._dirigera = new Dirigera.Dirigera(this.homey.settings.get('ipAddress'), this.homey.settings.get('accessToken'));
    this._gatewayConnected = true;
    this._debugLoggingEnabled = this.homey.settings.get('debugLogging');
    this.log('Connected to DIRIGERA gateway');
    const self = this;
    this._dirigera.startListeningForUpdates(
        async (updateEvent) => {
          if (this._debugLoggingEnabled) {
            this.log(`Update received: ${JSON.stringify(updateEvent)}`);
          }
          try {
            const id = updateEvent.data.id;
            const driver = self.getDriverForType(updateEvent.data.type, updateEvent.data.deviceType);
            const device = driver?.getDevice({
              id: id,
            })
            const newStatus = await self.getDevice(id).catch(this.handleError);
            if (device instanceof DirigeraDevice && newStatus !== null) {
              device.updateCapabilities(newStatus);
            }
          } catch (e) {
            this.log(`Error (${updateEvent.data.id}): ${e.message}`);
          }
        },
    );
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
        if (this._debugLoggingEnabled) {
          // this.log(`Device list: ${JSON.stringify(list)}`);
        }
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

  /*
   * @returns DirigeraDriver
   */
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
        break;
    }
    if (driverId != null) {
      return this.homey.drivers.getDriver(driverId);
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

  async startAuthenticationProcess(ipAddress) {
    this._authenticate = new Dirigera.AuthenticateV2(ipAddress);
    const self = this;
    return new Promise((resolve) => {
      self._authenticate.listener = {
        hubNotFound() {
          resolve({success: false, error: 'Hub was not found. Please check the IP address'});
          self._authenticate = null; // cleanup
        },
        pairingError(error) {
          resolve({success: false, error: error});
          self._authenticate = null; // cleanup
        },
        codeReceived() {
          resolve({success: true})
        }
      };
      self._authenticate.startAuthProcess();
    });
  }

  async getAccessToken() {
    if (this._authenticate == null) {
      return {success: false, error: 'Authentication flow not started. Please restart the flow.'};
    }
    const self = this;
    return new Promise((resolve) => {
      self._authenticate.listener = {
        pairingError(error) {
          resolve({success: false, error: error});
        },
        pairingSucceeded(result) {
          resolve({success: true, result: result});
          self._authenticate = null; // cleanup
        }
      };
      self._authenticate.checkForAccessCode();
    })
  }

  updateDebugging(debugging) {
    this._debugLoggingEnabled = debugging;
    if (debugging) {
      this.log("Debug logging enabled");
    } else {
      this.log("Debug logging disabled");
    }
  }

  handleError(error) {
    this.log(`Error: ${error}`)
  }
}
module.exports = IkeaDirigeraGatewayApp;
