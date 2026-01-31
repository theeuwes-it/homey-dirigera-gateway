'use strict';

const DirigeraDevice = require("../DirigeraDevice");

module.exports = class DirigeraSensorDevice extends DirigeraDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this._instanceId = this.getData().id;
    const device = await this.homey.app.getDevice(this._instanceId);
    await this.updateSettings(device);
    this.updateCapabilities(device);
    this.log(`Dirigera ${this.getName()} has been initialized`);
  }

  updateCapabilities(sensor) {
    if (typeof sensor !== 'undefined') {

      if (sensor.isReachable) {
        this.setAvailable()
            .catch(this.error);
      } else {
        this.setUnavailable('(temporary) unavailable')
            .catch(this.error);
      }

      // Temperature
      if (this.hasCapability('measure_temperature')) {
        this.setCapabilityValue('measure_temperature', sensor.attributes['currentTemperature'])
        .catch(this.error);
      }
      if (this.hasCapability('measure_humidity')) {
        this.setCapabilityValue('measure_humidity', sensor.attributes['currentRH'])
        .catch(this.error);
      }
      if (this.hasCapability('measure_pm25')) {
        this.setCapabilityValue('measure_pm25', sensor.attributes['currentPM25'])
        .catch(this.error);
      }
      if (this.hasCapability('measure_co2')) {
        this.setCapabilityValue('measure_co2', sensor.attributes['currentCO2'])
        .catch(this.error);
      }
    }
  }
};
