'use strict';

const Utils = require("../../utils");
const DirigeraDriver = require("../DirigeraDriver");

const CAPABILITIES_BY_PRODUCT = {
  // ALPSTUGA
  E2495: [
    'measure_temperature',
    'measure_humidity',
    'measure_pm25',
    'measure_co2',
  ]
};

module.exports = class MyDriver extends DirigeraDriver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('IKEA Dirigera Sensor Driver has been initialized');
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
    const sensors = [];
    for (const device of devices) {
      if (device.type !== 'sensor') {
        continue;
      }

      const productCode = device.attributes?.productCode;
      if (!productCode || !CAPABILITIES_BY_PRODUCT[productCode]) {
        continue;
      }

      const capabilities = [];
      if (device.attributes['currentTemperature']) {
        capabilities.push('measure_temperature')
      }
      if (device.attributes['currentRH']) {
        capabilities.push('measure_humidity')
      }
      if (device.attributes['currentPM25']) {
        capabilities.push('measure_pm25')
      }
      if (device.attributes['currentCO2']) {
        capabilities.push('measure_co2')
      }

      sensors.push({
        data: {
          id: device.id,
        },
        capabilities,
        name: (device['attributes'].customName !== '' ? device['attributes'].customName : device['attributes'].model),
      });
    }

    return sensors.sort(Utils._compareHomeyDevice);
  }
};
