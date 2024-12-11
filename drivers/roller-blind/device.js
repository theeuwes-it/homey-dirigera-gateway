'use strict';

const DirigeraDevice = require("../DirigeraDevice");

const CAPABILITIES_SET_DEBOUNCE = 100;

module.exports = class DirigeraRollerBlindDevice extends DirigeraDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this._instanceId = this.getData().id;
    this._desiredPosition = -1.0;
    const device = await this.homey.app.getDevice(this._instanceId);
    await this.updateSettings(device);
    this.updateCapabilities(device);
    this.registerMultipleCapabilityListener(this.getCapabilities(), this._onMultipleCapabilityListener.bind(this), CAPABILITIES_SET_DEBOUNCE);
    this.log(`Dirigera Roller Blind ${this.getName()} has been initialized`);
  }

  updateCapabilities(blind) {
    if (typeof blind !== 'undefined') {

      if (blind.isReachable) {
        this.setAvailable()
            .catch(this.error);
      } else {
        this.setUnavailable('(temporary) unavailable')
            .catch(this.error);
      }

      if (this.hasCapability('windowcoverings_tilt_set')) {
        const value = blind.attributes['blindsCurrentLevel'] / 100
        if (value === this._desiredPosition) {
          this._desiredPosition = -1
        }
        this.setCapabilityValue('windowcoverings_tilt_set', value)
            .catch(this.error);
      }
      if (this.hasCapability('measure_battery')) {
        this.setCapabilityValue('measure_battery', blind.attributes['batteryPercentage'])
            .catch(this.error);
      }
    }
  }

  async _onMultipleCapabilityListener(valueObj) {
    const dirigera = this.homey.app.getDirigera();
    const device = await this.homey.app.getDevice(this._instanceId);
    for (const [key, value] of Object.entries(valueObj)) {
      if (key === 'windowcoverings_tilt_set') {
        this._desiredPosition = -1 // We don't need to keep track anymore
        dirigera.setAttribute(this._instanceId, { 'blindsTargetLevel': value * 100 });

      } else if (key === 'windowcoverings_tilt_up') {
        if (this._desiredPosition === 100) { // Stop movement
          dirigera.setAttribute(this._instanceId, { 'blindsState': 'stopped', 'blindsTargetLevel': device.attributes['blindsCurrentLevel'] });
          this._desiredPosition = -1
        } else {
          dirigera.setAttribute(this._instanceId, {'blindsTargetLevel': 100});
          this._desiredPosition = 100
        }

      } else if (key === 'windowcoverings_tilt_down') {
        if (this._desiredPosition === 0) { // Stop movement
          dirigera.setAttribute(this._instanceId, { 'blindsState': 'stopped', 'blindsTargetLevel': device.attributes['blindsCurrentLevel'] });
          this._desiredPosition = -1
        } else {
          dirigera.setAttribute(this._instanceId, {'blindsTargetLevel': 0});
          this._desiredPosition = 0
        }
      }
    }
    return true;
  }
};
