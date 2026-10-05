'use strict';

const DirigeraDevice = require("../DirigeraDevice");

module.exports = class DirigeraOutletDevice extends DirigeraDevice {

  async onInit() {
    this._instanceId = this.getData().id;
    const device = await this.homey.app.getDevice(this._instanceId);
    await this.updateSettings(device);
    this._realId = device ? device.id : this._instanceId;

    const related = await this.homey.app.getRelatedDevices(this._instanceId);

    // Only outlets with an electricalSensor endpoint (e.g. GRILLPLATS) measure
    // energy; plain outlets such as the TRADFRI control outlet do not. Skip when
    // the device is missing from the gateway, as we can't tell which kind it is.
    const hasEnergy = related.some(d => d.deviceType === 'electricalSensor');
    if (device != null) {
      const energyCaps = ['measure_power', 'measure_voltage', 'measure_current', 'meter_power'];
      for (const cap of energyCaps) {
        if (hasEnergy && !this.hasCapability(cap)) {
          await this.addCapability(cap).catch(this.error);
        } else if (!hasEnergy && this.hasCapability(cap)) {
          await this.removeCapability(cap).catch(this.error);
        }
      }
    }

    this.updateCapabilities(device, related);

    this.registerCapabilityListener('onoff', async (value) => {
      const dirigera = this.homey.app.getDirigera();
      if (this.isDebugLoggingEnabled()) {
        this.log(`${this.getName()} - onoff: Setting outlet state to ${value}`);
      }
      dirigera.setAttribute(this._realId, { 'isOn': value });
    })

    if (hasEnergy) {
      this._pollInterval = this.homey.setInterval(async () => {
        try {
          const freshDevice = await this.homey.app.getDevice(this._instanceId);
          const freshRelated = await this.homey.app.getRelatedDevices(this._instanceId);
          this.updateCapabilities(freshDevice, freshRelated);
        } catch (err) {
          this.error('Poll refresh failed:', err);
        }
      }, 60000);
    }

    this.log(`Dirigera Outlet ${this.getName()} has been initialized`);
  }

  async onUninit() {
    if (this._pollInterval) {
      this.homey.clearInterval(this._pollInterval);
    }
  }

  updateCapabilities(status, related) {
    if (status == null) return;

    const isSensorStatus = status.deviceType === 'electricalSensor';

    if (!isSensorStatus) {
      if (status.isReachable) {
        this.setAvailable().catch(this.error);
      } else {
        this.setUnavailable('(temporary) unavailable').catch(this.error);
      }
      if (this.hasCapability('onoff') && status.attributes && 'isOn' in status.attributes) {
        this.setCapabilityValue('onoff', status.attributes['isOn']).catch(this.error);
      }
    }

    const sensorAttrs = isSensorStatus
        ? status.attributes
        : (related || []).find(d => d.deviceType === 'electricalSensor')?.attributes;

    if (sensorAttrs != null) {
      if (this.hasCapability('measure_power') && typeof sensorAttrs.currentActivePower === 'number') {
        this.setCapabilityValue('measure_power', sensorAttrs.currentActivePower).catch(this.error);
      }
      if (this.hasCapability('measure_voltage') && typeof sensorAttrs.currentVoltage === 'number') {
        this.setCapabilityValue('measure_voltage', sensorAttrs.currentVoltage).catch(this.error);
      }
      if (this.hasCapability('measure_current') && typeof sensorAttrs.currentAmps === 'number') {
        this.setCapabilityValue('measure_current', sensorAttrs.currentAmps).catch(this.error);
      }
      if (this.hasCapability('meter_power') && typeof sensorAttrs.totalEnergyConsumed === 'number') {
        this.setCapabilityValue('meter_power', sensorAttrs.totalEnergyConsumed).catch(this.error);
      }
    }
  }
};
