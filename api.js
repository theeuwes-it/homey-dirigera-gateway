module.exports = {
    async discover({homey, query}) {
        return await homey.app.discover();
    },

    async authenticate({homey, body}) {
        return await homey.app.authenticate(body.ip_address);
    }
}
