const Homey = require("homey");

module.exports = class DirigeraDevice extends Homey.Device {

    async updateSettings(device) {
        if (typeof device !== 'undefined') {
            await this.setSettings({capabilities: JSON.stringify(device.capabilities), attributes: JSON.stringify(device.attributes)});
        }
    }

    updateCapabilities(device) {

    }

    isDebugLoggingEnabled() {
        return this.homey.settings.get('debugLogging');
    }
}
