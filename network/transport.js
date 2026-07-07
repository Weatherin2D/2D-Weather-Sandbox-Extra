/**
 * WebSocket transport wrapper.
 */
(function(global) {
  'use strict';

  class WebSocketTransport {
    constructor() {
      this.ws = null;
      this.url = '';
      this._onOpen = null;
      this._onClose = null;
      this._onError = null;
      this._onJson = null;
      this._onBinary = null;
    }

    connect(url) {
      this.disconnect();
      this.url = url;
      return new Promise((resolve, reject) => {
        let settled = false;
        try {
          this.ws = new WebSocket(url);
        } catch (err) {
          reject(err);
          return;
        }
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
          if (this._onOpen) this._onOpen();
        };

        this.ws.onclose = (ev) => {
          if (!settled) {
            settled = true;
            reject(new Error('WebSocket closed before open'));
          }
          if (this._onClose) this._onClose(ev);
        };

        this.ws.onerror = () => {
          if (!settled) {
            settled = true;
            reject(new Error('WebSocket connection failed'));
          }
          if (this._onError) this._onError();
        };

        this.ws.onmessage = (ev) => {
          if (typeof ev.data === 'string') {
            if (this._onJson) this._onJson(ev.data);
          } else if (ev.data instanceof ArrayBuffer) {
            if (this._onBinary) this._onBinary(ev.data);
          }
        };
      });
    }

    disconnect() {
      if (this.ws) {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
          this.ws.close();
        this.ws = null;
      }
    }

    isConnected() {
      return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    sendJson(obj) {
      if (!this.isConnected()) return false;
      this.ws.send(JSON.stringify(obj));
      return true;
    }

    sendBinary(buffer) {
      if (!this.isConnected()) return false;
      this.ws.send(buffer);
      return true;
    }

    onOpen(fn) { this._onOpen = fn; }
    onClose(fn) { this._onClose = fn; }
    onError(fn) { this._onError = fn; }
    onJson(fn) { this._onJson = fn; }
    onBinary(fn) { this._onBinary = fn; }
  }

  global.WeatherMpTransport = { WebSocketTransport };
})(typeof window !== 'undefined' ? window : global);
