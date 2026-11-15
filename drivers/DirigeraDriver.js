const Homey = require("homey");

module.exports = class DirigeraDriver extends Homey.Driver {

    getNameForPairing(device, name) {
        return device.hubName ? `${name} (${device.hubName})` : name;
    }

    getIdFromDevice(device) {
        let id = device.id;
        if (device.relationId !== undefined && device.relationId !== null) {
            id = device.relationId;
        }
        return this.homey.app.getHomeyDeviceId(device.hubId, id);
    }
}
