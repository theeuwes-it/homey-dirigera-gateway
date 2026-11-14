'use strict';

const Utils = require('../../utils');
const DirigeraDriver = require("../DirigeraDriver");

module.exports = class DirigeraOutletDriver extends DirigeraDriver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('IKEA Dirigera Outlet Driver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    const devices = await this.homey.app.getPairableDevices();
    const outlets = [];
    for (const device of devices) {
      if (device.type !== 'outlet') {
        continue;
      }

      const id = this.getIdFromDevice(device);
      const capabilities = [];
      if (device.capabilities.canReceive.includes('isOn')) {
        capabilities.push('onoff');
      }
      outlets.push({
        data: {
          id: id,
        },
        capabilities,
        name: this.getNameForPairing(device, (device['attributes'].customName !== '' ? device['attributes'].customName : device['attributes'].model)),
      });
    }
    return outlets.sort(Utils._compareHomeyDevice);
  }

};
