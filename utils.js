class Utils {
    static _compareHomeyDevice(a, b) {
        if (a.name < b.name) {
            return -1;
        }
        if (a.name > b.name) {
            return 1;
        }
        return 0;
    }

    /**
     * MYGGSPRAY is split into occupancySensor + lightSensor that share a
     * relationId. Prefer occupancy (isDetected) and overlay illuminance from
     * the light endpoint so Homey gets motion and lux on one device.
     */
    static selectDirigeraDevice(devices, id) {
        const matches = devices.filter((device) => device.id === id || device.relationId === id);
        if (matches.length === 0) {
            return null;
        }
        const occupancy = matches.find((device) => (
            device.deviceType === 'occupancySensor' || device.deviceType === 'motionSensor'
        ));
        const light = matches.find((device) => device.deviceType === 'lightSensor');
        const primary = occupancy || matches[0];
        if (!light || light === primary) {
            return primary;
        }
        return {
            ...primary,
            attributes: {
                ...light.attributes,
                ...primary.attributes,
            },
        };
    }
}

module.exports = Utils;
