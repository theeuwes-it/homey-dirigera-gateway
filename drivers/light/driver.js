'use strict';

const Utils = require('../../utils');
const DirigeraDriver = require("../DirigeraDriver");

module.exports = class DirigeraLightDriver extends DirigeraDriver {

  async onInit() {
    this.log('IKEA Dirigera Light Driver has been initialized');
  }

  async onPairListDevices() {
    if (!this.homey.app.isGatewayConnected()) {
      throw new Error('First go to Settings -> Apps -> IKEA DIRIGERA Gateway to configure.');
    }

    const devices = await this.homey.app.getDevices();
    const lights = [];
    for (const device of devices) {
      if (device.type !== 'light') {
        continue;
      }

      const capabilities = [];
      if (device.capabilities.canReceive.includes('isOn')) {
        capabilities.push('onoff');
      }
      if (device.capabilities.canReceive.includes('lightLevel')) {
        capabilities.push('dim');
      }
      if (device.capabilities.canReceive.includes('colorTemperature')) {
        capabilities.push('light_temperature');
      }
      if (device.capabilities.canReceive.includes('colorHue')) {
        capabilities.push('light_hue');
      }
      if (device.capabilities.canReceive.includes('colorSaturation')) {
        capabilities.push('light_saturation');
      }
      lights.push({
        data: {
          id: device.id,
        },
        capabilities,
        name: (device['attributes'].customName !== '' ? device['attributes'].customName : device['attributes'].model),
      });
    }
    return lights.sort(Utils._compareHomeyDevice);
  }
}
