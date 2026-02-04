'use strict';

const Utils = require('../../utils');
const DirigeraDriver = require("../DirigeraDriver");

module.exports = class DirigeraDoorWindowSensorDriver extends DirigeraDriver {

  async onInit() {
    this.log('IKEA Dirigera Door/Window Sensor Driver has been initialized');
  }

  async onPairListDevices() {
    if (!this.homey.app.isGatewayConnected()) {
      throw new Error('First go to Settings -> Apps -> IKEA DIRIGERA Gateway to configure.');
    }

    const devices = await this.homey.app.getDevices();
    const doorWindowSensors = [];
    for (const device of devices) {
      if (device.type !== 'sensor' || device.deviceType !== 'openCloseSensor') {
        continue;
      }

      const capabilities = [
        'alarm_contact',
        'measure_battery'
      ];
      doorWindowSensors.push({
        data: {
          id: device.id,
        },
        capabilities,
        name: (device['attributes'].customName !== '' ? device['attributes'].customName : device['attributes'].model),
      });
    }
    return doorWindowSensors.sort(Utils._compareHomeyDevice);
  }
}
