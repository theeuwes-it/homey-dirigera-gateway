const Homey = require("homey");

const Utils = require('../utils');

module.exports = class DirigeraDevice extends Homey.Device {

    getDirigeraAddress() {
        return this.homey.app.getDeviceAddress(this.getData().id);
    }

    getDirigeraConnection() {
        return this.homey.app.getHubConnection(this.getDirigeraAddress().hubId);
    }

    async getDirigeraDevice() {
        const devices = await this.getDirigeraConnection().getDevices();
        return Utils.selectDirigeraDevice(devices, this.getDirigeraAddress().deviceId);
    }

    async getInitialDirigeraDevice() {
        try {
            const device = await this.getDirigeraDevice();
            if (device) return device;
            await this.setUnavailable('Device not found on its DIRIGERA hub');
        } catch (err) {
            this.error(err);
            await this.setUnavailable('DIRIGERA hub unavailable');
        }
        return null;
    }

    async getRelatedDirigeraDevices() {
        const { deviceId } = this.getDirigeraAddress();
        const devices = await this.getDirigeraConnection().getDevices();
        return devices.filter(device => device.id === deviceId || device.relationId === deviceId);
    }

    async updateSettings(device) {
        if (typeof device !== 'undefined' && device != null) {
            await this.setSettings({capabilities: JSON.stringify(device.capabilities), attributes: JSON.stringify(device.attributes)});
        }
    }

    updateCapabilities(device) {

    }

    isDebugLoggingEnabled() {
        return this.homey.settings.get('debugLogging');
    }
}
