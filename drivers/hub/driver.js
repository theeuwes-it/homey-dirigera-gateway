'use strict';

const Homey = require('homey');
const {ZigBeeDriver} = require("homey-zigbeedriver");

module.exports = class DirigeraHubDriver extends ZigBeeDriver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('IKEA Dirigera Hub Driver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    return [
      {
        name: 'IKEA Dirigera Hub Device',
        data: {
          id: '1e87e78e-97c8-4f87-bb35-f1328989989d',
        },
      },
    ];
  }

};
