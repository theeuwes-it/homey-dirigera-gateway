'use strict';

const DirigeraDevice = require("../DirigeraDevice");

module.exports = class DirigeraMotionSensorDevice extends DirigeraDevice {

  async onInit() {
    this._instanceId = this.getData().id;
    const device = await this.homey.app.getDevice(this._instanceId);
    await this.updateSettings(device);
    this.updateCapabilities(device);
    this.log(`Dirigera Motion sensor ${this.getName()} has been initialized`);
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

      this.setCapabilityValue('alarm_motion', false)
          .catch(this.error);
    }
  }
}
