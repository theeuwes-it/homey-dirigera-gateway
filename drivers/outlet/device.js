'use strict';

const DirigeraDevice = require("../DirigeraDevice");

module.exports = class DirigeraOutletDevice extends DirigeraDevice {

  async onInit() {
    this._instanceId = this.getData().id;
    const device = await this.homey.app.getDevice(this._instanceId);
    this.updateCapabilities(device);
    this.registerCapabilityListener('onoff', async (value) => {
      const dirigera = this.homey.app.getDirigera();
      dirigera.setAttribute(this._instanceId, { 'isOn': value });
    })
    this.log(`Dirigera Outlet ${this.getName()} has been initialized`);
  }

  updateCapabilities(outlet) {
    if (typeof outlet !== 'undefined') {

      if (outlet.isReachable) {
        this.setAvailable()
            .catch(this.error);
      } else {
        this.setUnavailable('(temporary) unavailable')
            .catch(this.error);
      }
      if (this.hasCapability('onoff')) {
        this.setCapabilityValue('onoff', outlet.attributes['isOn'])
            .catch(this.error);
      }
    }
  }
};
