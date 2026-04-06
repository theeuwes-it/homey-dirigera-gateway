'use strict';

const Utils = require('../../utils');
const DirigeraDriver = require("../DirigeraDriver");

module.exports = class DirigeraMotionSensorDriver extends DirigeraDriver {

  async onInit() {
    this.log('IKEA Dirigera Motion Sensor Driver has been initialized');
  }

  async onPairListDevices() {
    if (!this.homey.app.isGatewayConnected()) {
      throw new Error('First go to Settings -> Apps -> IKEA DIRIGERA Gateway to configure.');
    }

    const devices = await this.homey.app.getDevices();
    const motionSensors = [];
    for (const device of devices) {
      if (device.type !== 'sensor' || device.deviceType !== 'motionSensor') {
        continue;
      }

      const id = this.getIdFromDevice(device);
      const capabilities = [
        'alarm_motion',
        'measure_luminance',
        'measure_battery'
      ];
      motionSensors.push({
        data: {
          id: id,
        },
        capabilities,
        name: (device['attributes'].customName !== '' ? device['attributes'].customName : device['attributes'].model),
      });
    }
    return motionSensors.sort(Utils._compareHomeyDevice);
  }
}
