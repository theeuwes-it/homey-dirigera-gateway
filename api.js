module.exports = {
    async discover({homey, query}) {
        return await homey.app.discover();
    },

    async authenticate({homey, body}) {
        return await homey.app.authenticate(body.ip_address);
    },

    async setDebugging({homey, body}) {
        homey.app.updateDebugging(body.debug_logging);
    }
}
