'use strict';

const Utils = require('../../utils');
const DirigeraDriver = require("../DirigeraDriver");

module.exports = class DirigeraMotionSensorDriver extends DirigeraDriver {

  async onInit() {
    this.log('IKEA Dirigera Motion Sensor Driver has been initialized');
  }

  async onPairListDevices() {
    const devices = await this.homey.app.getPairableDevices();
    const motionSensors = [];
    for (const device of devices) {
      // MYGGSPRAY is a Matter device and reports itself as an occupancySensor
      // instead of a motionSensor.
      if (device.deviceType !== 'motionSensor' && device.deviceType !== 'occupancySensor') {
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
        store: {
          matterIlluminance: device.deviceType === 'occupancySensor',
        },
        name: this.getNameForPairing(device, (device['attributes'].customName !== '' ? device['attributes'].customName : device['attributes'].model)),
      });
    }
    return motionSensors.sort(Utils._compareHomeyDevice);
  }
}
