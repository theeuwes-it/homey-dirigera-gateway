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

      this.colorTemperatureMax = light.attributes['colorTemperatureMax'];
      this.colorTemperatureMin = light.attributes['colorTemperatureMin'];

      const colorMode = light.attributes['colorMode'];
      let colorModeTemperature = false;
      let colorModeColor = false;
      if (colorMode !== undefined) {
        colorModeTemperature = colorMode === "temperature";
        colorModeColor = colorMode === "color";

        if (this.hasCapability('light_mode')) {
          this.setCapabilityValue('light_mode', colorMode)
              .catch(this.error);
        }
      }

      if (this.hasCapability('onoff')) {
        this.setCapabilityValue('onoff', light.attributes['isOn'])
          .catch(this.error);
      }

      if (this.hasCapability('dim')) {
        this.setCapabilityValue('dim', light.attributes['lightLevel'] / 100)
          .catch(this.error);
      }

      if (this.hasCapability('light_temperature') && colorModeTemperature) {
        const kelvinCool = Math.max(this.colorTemperatureMin, this.colorTemperatureMax);
        const kelvinWarm = Math.min(this.colorTemperatureMin, this.colorTemperatureMax);
        const kelvin = light.attributes['colorTemperature'];
        const value = 1 - ((kelvin - kelvinWarm) / (kelvinCool - kelvinWarm));
        this.setCapabilityValue('light_temperature', value)
          .catch(this.error);
      }

      if (this.hasCapability('light_hue') && colorModeColor) {
        this.setCapabilityValue('light_hue', light.attributes['colorHue'] / 360)
          .catch(this.error);
      }

      if (this.hasCapability('light_saturation') && colorModeColor) {
        this.setCapabilityValue('light_saturation', light.attributes['colorSaturation'])
          .catch(this.error);
      }
    }
  }

  _onMultipleCapabilityListener(valueObj) {
    const dirigera = this.homey.app.getDirigera();
    for (const [key, value] of Object.entries(valueObj)) {
      if (key === 'dim') {
        if (this.isDebugLoggingEnabled()) {
          this.log(`${this.getName()} - dim: Setting light level to ${value * 100}`);
        }
        dirigera.setAttribute(this._instanceId, { 'lightLevel': value * 100 });
      } else if (key === 'onoff') {
        if (this.isDebugLoggingEnabled()) {
          this.log(`${this.getName()} - onoff: Setting light state to ${value}`);
        }
        dirigera.setAttribute(this._instanceId, { 'isOn': value });
      } else if (key === 'light_temperature') {
        const kelvinCool = Math.max(this.colorTemperatureMin, this.colorTemperatureMax);
        const kelvinWarm = Math.min(this.colorTemperatureMin, this.colorTemperatureMax);

        const kelvin = kelvinWarm + (1 - value) * (kelvinCool - kelvinWarm);
        if (this.isDebugLoggingEnabled()) {
          this.log(`${this.getName()} - light_temperature: Setting color temperature to ${kelvin}K`);
        }
        dirigera.setAttribute(this._instanceId, {
          'colorTemperature': kelvin,
        });
        if (this.hasCapability('light_mode')) {
          this.setCapabilityValue('light_mode', 'temperature')
              .catch(this.error);
        }
      }
    }

    // Color
    const hasHue = "light_hue" in valueObj;
    const hasSaturation = "light_saturation" in valueObj;
    if (hasHue && hasSaturation) {
      const hue = valueObj["light_hue"];
      const saturation = valueObj["light_saturation"];
      if (this.hasCapability('light_mode')) {
        this.setCapabilityValue('light_mode', 'color')
            .catch(this.error);
      }
      dirigera.setAttribute(this._instanceId, {
        'colorHue': hue * 360,
        'colorSaturation': saturation,
      });
    }

    return true;
  }

}
