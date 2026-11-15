'use strict';

const Utils = require('../../utils');
const DirigeraDriver = require('../DirigeraDriver');

module.exports = class DirigeraAirQualitySensorDriver extends DirigeraDriver {

  async onPairListDevices() {
    if (!this.homey.app.isGatewayConnected()) {
      throw new Error(this.homey.__('air_quality_sensor.gateway_not_configured'));
    }

    const devices = await this.homey.app.getDevices();
    const sensors = new Map();
    for (const device of devices) {
      if (device.deviceType !== 'environmentSensor') continue;
      const id = this.getIdFromDevice(device);
      if (!sensors.has(id)) sensors.set(id, []);
      sensors.get(id).push(device);
    }

    const pairable = [];
    for (const [id, endpoints] of sensors) {
      const alpstuga = endpoints.find(({ attributes = {} }) => (
        attributes.productCode === 'E2495' || /^ALPSTUGA(?:\s|$)/i.test(attributes.model || '')
      ));
      const timmerflotte = endpoints.find(({ attributes = {} }) => (
        attributes.productCode === 'E2314' || /^TIMMERFLOTTE(?:\s|$)/i.test(attributes.model || '')
      ));
      if (!alpstuga && !timmerflotte) continue;

      const device = alpstuga || endpoints.find(({ attributes }) => attributes?.customName) || timmerflotte;
      const { customName, model } = device.attributes || {};
      const capabilities = alpstuga
        ? ['measure_co2', 'measure_pm25', 'measure_temperature', 'measure_humidity']
        : ['measure_temperature', 'measure_humidity', 'measure_battery'];
      pairable.push({
        data: { id },
        name: customName || model || (alpstuga ? 'ALPSTUGA' : 'TIMMERFLOTTE'),
        icon: alpstuga ? '/icon.svg' : '/timmerflotte.svg',
        capabilities,
      });
    }
    return pairable.sort(Utils._compareHomeyDevice);
  }
};
