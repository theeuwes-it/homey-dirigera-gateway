const Homey = require("homey");

module.exports = class DirigeraDriver extends Homey.Driver {

    getIdFromDevice(device) {
        let id = device.id;
        if (device.relationId !== undefined && device.relationId !== null) {
            id = device.relationId;
        }
        return id;
    }
}
