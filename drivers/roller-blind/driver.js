'use strict';

const Homey = require('homey');
const Utils = require("../../utils");

module.exports = class MyDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('IKEA Dirigera Roller Blind Driver has been initialized');
  }

  updateCapabilities(device) {
    for (const device of this.getDevices()) {
      if (device.getData().id === device.instanceId) {
        device.updateCapabilities(device);
      }
    }
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
      if (device.type !== 'blind') {
        continue;
      }

      const capabilities = [];
      if (device.capabilities.canReceive.includes('position')) {
        capabilities.push('windowcoverings_tilt_set')
      }
      if (device.capabilities.canReceive.includes('trigger')) {
        capabilities.push('windowcoverings_tilt_down')
        capabilities.push('windowcoverings_tilt_up')
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
