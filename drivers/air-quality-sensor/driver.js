'use strict';

const Utils = require('../../utils');
const DirigeraDriver = require('../DirigeraDriver');

module.exports = class DirigeraAirQualitySensorDriver extends DirigeraDriver {

  async onPairListDevices() {
    if (!this.homey.app.isGatewayConnected()) {
      throw new Error('First go to Settings -> Apps -> IKEA DIRIGERA Gateway to configure.');
    }

    const devices = await this.homey.app.getDevices();
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
          name: attributes.customName || attributes.model || 'ALPSTUGA',
          capabilities: ['measure_co2', 'measure_pm25', 'measure_temperature', 'measure_humidity'],
        });
      }
    }
    return Array.from(sensors.values()).sort(Utils._compareHomeyDevice);
  }
};
