'use strict';

const { randomUUID } = require('crypto');
const Dirigera = require('dirigera-simple');
const ReconnectingWebSocket = require('reconnecting-websocket');
const Utils = require('../utils');

class HubConnection {
  constructor(homey, hub) {
    this.homey = homey;
    this.hub = hub;
    this.client = new Dirigera.Dirigera(hub.ipAddress, hub.accessToken);
  }

  listen(onMessage, onOpen, onClose) {
    const { ipAddress, accessToken } = this.hub;
    // dirigera-simple shares its update socket and keepalive timer across clients.
    this.socket = new ReconnectingWebSocket(`wss://${ipAddress}:8443/v1`, [], {
      webSocketOptions: {
        headers: { authorization: `Bearer ${accessToken}` },
        rejectUnauthorized: false,
      },
    });
    this.socket.addEventListener('message', message => onMessage(String(message.data)));
    this.socket.addEventListener('open', onOpen);
    this.socket.addEventListener('close', onClose);
    this.keepalive = this.homey.setInterval(() => {
      if (this.socket.readyState === 1) {
        this.socket.send(JSON.stringify({
          id: randomUUID(),
          specversion: '1.1.0',
          source: 'urn:theeuwes-it:dirigera',
          time: new Date().toISOString(),
          type: 'ping',
          data: null,
        }));
      }
    }, 30000);
  }

  close() {
    if (this.keepalive) this.homey.clearInterval(this.keepalive);
    if (this.socket) this.socket.close();
  }

  async getDevices(timeout = 10000) {
    const list = await new Promise((resolve, reject) => {
      const timer = this.homey.setTimeout(() => {
        reject(new Error(`No response from ${this.hub.name} at ${this.hub.ipAddress}`));
      }, timeout);
      try {
        this.client.getDeviceList(data => {
          this.homey.clearTimeout(timer);
          resolve(data);
        });
      } catch (err) {
        this.homey.clearTimeout(timer);
        reject(err);
      }
    });
    const devices = Utils.parseDeviceList(list);
    // The client gates setAttribute on the constructor's initial fetch.
    // A later successful fetch also makes its device cache ready for commands.
    this.client.state.loaded = true;
    return devices;
  }
}

module.exports = HubConnection;
