'use strict';

const Homey = require('homey');

module.exports = class DirigeraRollerBlindDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this._instanceId = this.getData().id;
    this._desiredPosition = -1.0;
    const device = await this.homey.app.getDevice(this._instanceId);
    this.updateCapabilities(device);
    this.registerMultipleCapabilityListener(this.getCapabilities(), this._onMultipleCapabilityListener.bind(this), CAPABILITIES_SET_DEBOUNCE);
    this.registerCapabilityListener('windowcoverings_tilt_set', async (value) => {
      const dirigera = this.homey.app.getDirigera();
      dirigera.setAttribute(this._instanceId, { 'position': value });
    })
    this.log(`Dirigera Roller Blind ${this.getName()} has been initialized`);
  }

  updateCapabilities(blind) {
    if (typeof blind !== 'undefined') {

      if (blind.isReachable) {
        this.setAvailable()
            .catch(this.error);
      } else {
        this.setUnavailable('(temporary) unavailable')
            .catch(this.error);
      }

      if (this.hasCapability('windowcoverings_tilt_set')) {
        const value = blind.attributes['position'] / 100
        if (value === this._desiredPosition) {
          this._desiredPosition = -1
        }
        this.setCapabilityValue('windowcoverings_tilt_set', value)
            .catch(this.error);
      }
    }
  }

  _onMultipleCapabilityListener(valueObj) {
    const dirigera = this.homey.app.getDirigera();
    for (const [key, value] of Object.entries(valueObj)) {
      if (key === 'windowcoverings_tilt_set') {
        this._desiredPosition = -1 // We don't need to keep track anymore
        dirigera.setAttribute(this._instanceId, { 'position': value * 100 });

      } else if (key === 'windowcoverings_tilt_up') {
        if (this._desiredPosition === 100) { // Stop movement
          dirigera.setAttribute(this._instanceId, { 'trigger': 1, 'position': Number.NaN });
          this._desiredPosition = -1
        } else {
          dirigera.setAttribute(this._instanceId, {'position': 100});
          this._desiredPosition = 100
        }

      } else if (key === 'windowcoverings_tilt_down') {
        if (this._desiredPosition === 0) { // Stop movement
          dirigera.setAttribute(this._instanceId, { 'trigger': 1, 'position': Number.NaN });
          this._desiredPosition = -1
        } else {
          dirigera.setAttribute(this._instanceId, {'position': 0});
          this._desiredPosition = 0
        }
      }
    }
    return true;
  }
};
