'use strict';

const DirigeraDevice = require('../DirigeraDevice');

const MEASUREMENTS = {
  measure_co2: 'currentCO2',
  measure_pm25: 'currentPM25',
  measure_temperature: 'currentTemperature',
  measure_humidity: 'currentRH',
};

module.exports = class DirigeraAirQualitySensorDevice extends DirigeraDevice {

  async onInit() {
    const device = await this.homey.app.getDevice(this.getData().id);
    await this.updateSettings(device);
    await this.updateCapabilities(device);
    this.log(`Dirigera Air Quality sensor ${this.getName()} has been initialized`);
  }

  async updateCapabilities(sensor) {
    if (!sensor || !sensor.isReachable) {
      await this.setUnavailable(this.homey.__('air_quality_sensor.unavailable')).catch(this.error);
      return;
    }
    await this.setAvailable().catch(this.error);

    const attributes = sensor.attributes || {};
    // canReceive describes writable attributes; ALPSTUGA's measurements are
    // reported in attributes without appearing in either capabilities list.
    for (const [capability, attribute] of Object.entries(MEASUREMENTS)) {
      const value = attributes[attribute];
      if (this.hasCapability(capability) && Number.isFinite(value)) {
        await this.setCapabilityValue(capability, value).catch(this.error);
      }
    }
  }
};
