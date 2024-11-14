'use strict';

const Homey = require('homey');

const CAPABILITIES_SET_DEBOUNCE = 100;

module.exports = class DirigeraLightDevice extends Homey.Device {

  async onInit() {
    this._instanceId = this.getData().id;
    const device = await this.homey.app.getDevice(this._instanceId);
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

      // if (this.hasCapability('light_temperature')) {
      //   this.setCapabilityValue('light_temperature', light.colorTemperature / 100)
      //     .catch(this.error);
      // }
      //
      // if (this.hasCapability('light_hue')) {
      //   this.setCapabilityValue('light_hue', light.hue / 360)
      //     .catch(this.error);
      // }
      //
      // if (this.hasCapability('light_saturation')) {
      //   this.setCapabilityValue('light_saturation', light.saturation / 100)
      //     .catch(this.error);
      // }
    }
  }

  _onMultipleCapabilityListener(valueObj) {
    const dirigera = this.homey.app.getDirigera();
    for (const [key, value] of Object.entries(valueObj)) {
      if (key === 'dim') {
        dirigera.setAttribute(this._instanceId, { 'lightLevel': value * 100 });
      } else if (key === 'onoff') {
        dirigera.setAttribute(this._instanceId, { 'isOn': value });
      }
      // else if (key === 'light_temperature') {
      //   // commands['colorTemperature'] = value * 100;
      //   dirigera.setAttribute(this._instanceId, { 'lightLevel': value * 100 });
      // } else if (key === 'light_hue') {
      //   // commands['hue'] = value * 360;
      //   dirigera.setAttribute(this._instanceId, { 'lightLevel': value * 100 });
      // } else if (key === 'light_saturation') {
      //   // commands['saturation'] = value * 100;
      //   dirigera.setAttribute(this._instanceId, { 'lightLevel': value * 100 });
      // }
    }
    return true;
  }

}
