'use strict';

const Utils = require('../../utils');
const DirigeraDriver = require('../DirigeraDriver');

module.exports = class DirigeraAirQualitySensorDriver extends DirigeraDriver {

  async onPairListDevices() {
    const devices = await this.homey.app.getPairableDevices();
    const sensors = new Map();
    for (const device of devices) {
      const attributes = device.attributes || {};
      if (device.deviceType !== 'environmentSensor'
          || (attributes.productCode !== 'E2495' && !/^ALPSTUGA(?:\s|$)/i.test(attributes.model || ''))) {
        continue;
      }

      const id = this.getIdFromDevice(device);
      if (!sensors.has(id)) {
        sensors.set(id, {
          data: { id },
          name: this.getNameForPairing(device, attributes.customName || attributes.model || 'ALPSTUGA'),
          capabilities: ['measure_co2', 'measure_pm25', 'measure_temperature', 'measure_humidity'],
        });
      }
    }
    return Array.from(sensors.values()).sort(Utils._compareHomeyDevice);
  }
};
