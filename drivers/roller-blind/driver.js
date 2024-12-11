'use strict';

const Utils = require("../../utils");
const DirigeraDriver = require("../DirigeraDriver");

module.exports = class MyDriver extends DirigeraDriver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('IKEA Dirigera Roller Blind Driver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    if (!this.homey.app.isGatewayConnected()) {
      throw new Error('First go to Settings -> Apps -> IKEA DIRIGERA Gateway to configure.');
    }

    const devices = await this.homey.app.getDevices();
    const blinds = [];
    for (const device of devices) {
      if (device.type !== 'blinds') {
        continue;
      }

      const capabilities = [];
      if (device.capabilities.canReceive.includes('blindsTargetLevel')) {
        capabilities.push('windowcoverings_tilt_set')
      }
      if (device.capabilities.canReceive.includes('blindsState')) {
        capabilities.push('windowcoverings_tilt_down')
        capabilities.push('windowcoverings_tilt_up')
      }
      if (device.attributes['batteryPercentage']) {
        capabilities.push('measure_battery')
      }

      blinds.push({
        data: {
          id: device.id,
        },
        capabilities,
        name: (device['attributes'].customName !== '' ? device['attributes'].customName : device['attributes'].model),
      });
    }

    return blinds.sort(Utils._compareHomeyDevice);
  }
};
