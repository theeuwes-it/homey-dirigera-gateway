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

      var isDetected = sensor.attributes['isDetected'];
      if (isDetected !== undefined) {
        this.setCapabilityValue('alarm_motion', Boolean(isDetected))
            .catch(this.error);
      }

      // Only the occupancySensor half of a MYGGSPRAY identifies it as a Matter
      // device, while illuminance arrives from its lightSensor half. Remember it
      // here so sensors that were paired before this flag existed are corrected too.
      if (sensor.deviceType === 'occupancySensor' && !this.getStoreValue('matterIlluminance')) {
        this.setStoreValue('matterIlluminance', true)
            .catch(this.error);
      }

      var illuminance = sensor.attributes['illuminance'];
      if (illuminance !== undefined) {
        this.setCapabilityValue('measure_luminance', this.toLux(illuminance))
            .catch(this.error);
      }

      var batteryLevel = sensor.attributes['batteryPercentage'];
      if (batteryLevel !== undefined) {
        this.setCapabilityValue('measure_battery', batteryLevel)
            .catch(this.error);
      }
    }
  }

  /*
   * Matter reports illuminance on the logarithmic scale it shares with Zigbee:
   * MeasuredValue = 10000 * log10(lux) + 1, where 0 means 'too low to measure'.
   * The gateway resolves this to lux for Zigbee sensors such as Vallhorn, but
   * passes the raw value straight through for Matter sensors such as MYGGSPRAY.
   */
  toLux(illuminance) {
    if (!this.getStoreValue('matterIlluminance')) {
      return illuminance;
    }
    if (illuminance <= 0) {
      return 0;
    }
    return Math.round(Math.pow(10, (illuminance - 1) / 10000) * 10) / 10;
  }
}
