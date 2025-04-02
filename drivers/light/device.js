'use strict';

const DirigeraDevice = require("../DirigeraDevice");

const CAPABILITIES_SET_DEBOUNCE = 100;

module.exports = class DirigeraLightDevice extends DirigeraDevice {

  async onInit() {
    this._instanceId = this.getData().id;
    const device = await this.homey.app.getDevice(this._instanceId);
    await this.updateSettings(device);
    this.updateCapabilities(device);
    this.registerMultipleCapabilityListener(this.getCapabilities(), this._onMultipleCapabilityListener.bind(this), CAPABILITIES_SET_DEBOUNCE);
    this.log(`Dirigera Light ${this.getName()} has been initialized`);
  }

  updateCapabilities(light) {
    if (typeof light !== 'undefined') {

      if (light.isReachable) {
        this.setAvailable()
          .catch(this.error);
      } else {
        this.setUnavailable('(temporary) unavailable')
          .catch(this.error);
      }

      if (this.hasCapability('onoff')) {
        this.setCapabilityValue('onoff', light.attributes['isOn'])
          .catch(this.error);
      }

      if (this.hasCapability('dim')) {
        this.setCapabilityValue('dim', light.attributes['lightLevel'] / 100)
          .catch(this.error);
      }

      if (this.hasCapability('light_temperature')) {
        this.setCapabilityValue('light_temperature', light.attributes['colorTemperature'] / 100)
          .catch(this.error);
      }

      if (this.hasCapability('light_hue')) {
        this.setCapabilityValue('light_hue', light.attributes['hue'] / 360)
          .catch(this.error);
      }

      if (this.hasCapability('light_saturation')) {
        this.setCapabilityValue('light_saturation', light.attributes['saturation'] / 100)
          .catch(this.error);
      }
    }
  }

  _onMultipleCapabilityListener(valueObj) {
    const dirigera = this.homey.app.getDirigera();
    for (const [key, value] of Object.entries(valueObj)) {
      if (key === 'dim') {
        dirigera.setAttribute(this._instanceId, { 'lightLevel': value * 100 });
      } else if (key === 'onoff') {
        dirigera.setAttribute(this._instanceId, { 'isOn': value });
      } else if (key === 'light_temperature') {
        dirigera.setAttribute(this._instanceId, { 'colorTemperature': value * 100 });
      } else if (key === 'light_hue') {
        dirigera.setAttribute(this._instanceId, { 'colorHue': value * 360 });
      } else if (key === 'light_saturation') {
        dirigera.setAttribute(this._instanceId, { 'colorSaturation': value * 100 });
      }
    }
    return true;
  }

}
