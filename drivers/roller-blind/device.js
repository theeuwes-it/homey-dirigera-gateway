'use strict';

const DirigeraDevice = require("../DirigeraDevice");

const CAPABILITIES_SET_DEBOUNCE = 100;

module.exports = class DirigeraRollerBlindDevice extends DirigeraDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this._instanceId = this.getData().id;
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

      // Blinds level
      const currentLevel = blind.attributes['blindsCurrentLevel'];
      if (this.hasCapability('windowcoverings_set')) {
        this.setCapabilityValue('windowcoverings_set', (100 - currentLevel) / 100)
            .catch(this.error);
      }
      if (this.hasCapability('windowcoverings_closed')) {
        this.setCapabilityValue('windowcoverings_closed', currentLevel === 100)
            .catch(this.error);
      }
      // Battery
      if (this.hasCapability('measure_battery')) {
        this.setCapabilityValue('measure_battery', blind.attributes['batteryPercentage'])
            .catch(this.error);
      }
      if (this.hasCapability('alarm_battery')) {
        const currentAlarm = this.getCapabilityValue('alarm_battery');
        const currentPercentage = blind.attributes['batteryPercentage'];
        if (currentPercentage < 20 && !currentAlarm) {
          this.setCapabilityValue('alarm_battery', true)
              .catch(this.error);
        } else if (currentPercentage >= 20 && currentAlarm) {
          this.setCapabilityValue('alarm_battery', false)
              .catch(this.error);
        }
      }
    }
  }

  async _onMultipleCapabilityListener(valueObj) {
    const dirigera = this.homey.app.getDirigera();
    for (const [key, value] of Object.entries(valueObj)) {
      if (key === 'windowcoverings_set') {
        dirigera.setAttribute(this._instanceId, { 'blindsTargetLevel': 100 - (value * 100) });
      } else if (key === 'windowcoverings_closed') {
        dirigera.setAttribute(this._instanceId, { 'blindsTargetLevel': value ? 0 : 100 });
      }
    }
    return true;
  }
};
