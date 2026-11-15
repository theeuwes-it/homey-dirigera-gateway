module.exports = {
    async discover({homey}) {
        return homey.app.discover();
    },

    async getDevices({homey}) {
        const devices = await homey.app.getPairableDevices();
        return devices.map(({ hubId, hubName, ...device }) => device);
    },

    async getHubs({homey}) {
        return homey.app.getHubs();
    },

    async renameHub({homey, body}) {
        return homey.app.renameHub(body.hub_id, body.name);
    },

    async removeHub({homey, body}) {
        return { hubs: await homey.app.removeHub(body.hub_id) };
    },

    async startAuthenticationProcess({homey, body}) {
        return homey.app.startAuthenticationProcess(body);
    },

    async getAccessToken({homey, body}) {
        return homey.app.finishAuthentication(body.session_id);
    },

    async setDebugging({homey, body}) {
        homey.settings.set('debugLogging', Boolean(body.debug_logging));
    },
};
