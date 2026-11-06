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
     * The gateway answers /v1/devices with an array. Anything else (e.g. an
     * `{error: ...}` object on a 401 or an Error from a failed request) means
     * we can't list devices; throw a readable error instead of handing a
     * non-array to the drivers.
     */
    static parseDeviceList(response) {
        if (Array.isArray(response)) {
            return response;
        }
        let reason = 'unexpected response';
        if (response instanceof Error) {
            reason = response.message;
        } else if (response && typeof response === 'object') {
            reason = response.error || response.message || JSON.stringify(response);
        } else if (response !== undefined && response !== null) {
            reason = String(response);
        }
        throw new Error(`Could not get the device list from the DIRIGERA gateway (${reason}). Check the IP address and re-authenticate in Settings -> Apps -> IKEA DIRIGERA Gateway.`);
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
