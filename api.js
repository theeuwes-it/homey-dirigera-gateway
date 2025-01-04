module.exports = {
    async discover({homey, query}) {
        return await homey.app.discover();
    },

    async getDevices({homey, query}) {
        return await homey.app.getDevices();
    },

    async startAuthenticationProcess({homey, body}) {
        return await homey.app.startAuthenticationProcess(body.ip_address);
    },

    async getAccessToken({homey, body}) {
        return await homey.app.getAccessToken();
    },

    async setDebugging({homey, body}) {
        homey.app.updateDebugging(body.debug_logging);
    }
}
