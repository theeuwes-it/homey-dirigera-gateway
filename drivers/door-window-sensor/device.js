'use strict';

const DirigeraDevice = require("../DirigeraDevice");

module.exports = class DirigeraDoorWindowSensorDevice extends DirigeraDevice {

  async onInit() {
    this._instanceId = this.getData().id;
    const device = await this.homey.app.getDevice(this._instanceId);
    await this.updateSettings(device);
    this.updateCapabilities(device);
    this.log(`Dirigera Door/Window sensor ${this.getName()} has been initialized`);
  }

  updateCapabilities(sensor) {
    if (typeof sensor !== 'undefined' && sensor !== null) {

      if (sensor.isReachable) {
        this.setAvailable()
          .catch(this.error);
      } else {
        this.setUnavailable('(temporary) unavailable')
          .catch(this.error);
      }
      
      var isOpen = sensor.attributes['isOpen'];
      if (isOpen !== undefined) {
        this.setCapabilityValue('alarm_contact', isOpen)
            .catch(this.error);
      }

      var batteryLevel = sensor.attributes['batteryPercentage'];
      if (batteryLevel !== undefined) {
        this.setCapabilityValue('measure_battery', batteryLevel)
            .catch(this.error);
      }
    }
  }
}
