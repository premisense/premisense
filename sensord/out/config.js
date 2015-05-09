"use strict";
"use strict";
var assert = require('chai').assert;
var events = require('events');
var mqtt = require('mqtt');
var winston = require('winston');
var fs = require('fs');
var tty = require('tty');
var util = require('util');
var split = require('split');
var yargs = require('yargs');
var winston_syslog = require('winston-syslog');
var os = require('os');
var _ = require('lodash');
var U = require('./u');
var gatewayModule = require('./gateway');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var configError = function(msg) {
  assert.argumentTypes(msg, $traceurRuntime.type.string);
  console.error("config error: " + msg);
  process.exit(10);
};
var Config = (function() {
  function Config() {
    this.gateways = [];
  }
  return ($traceurRuntime.createClass)(Config, {
    get mqttClient() {
      return assert.returnType((this.$__0), mqtt.Client);
    },
    set mqttClient(value) {
      assert.argumentTypes(value, mqtt.Client);
      this.$__0 = value;
    },
    get gateways() {
      return assert.returnType((this.$__1), $traceurRuntime.genericType(Array, gatewayModule.Gateway));
    },
    set gateways(value) {
      assert.argumentTypes(value, $traceurRuntime.genericType(Array, gatewayModule.Gateway));
      this.$__1 = value;
    },
    doLoad: function(configJson) {
      assert.argumentTypes(configJson, $traceurRuntime.type.any);
      var self = this;
      logger.debug(util.format("loading mqtt settings"));
      if (!configJson['mqtt'])
        configError("missing mqtt section");
      var mqttOptions = configJson['mqtt']['options'];
      if (!mqttOptions)
        configError("missing mqtt options section");
      this.mqttClient = mqtt.connect(mqttOptions);
      logger.debug(util.format("loading gateways"));
      this.gateways = [];
      if (!configJson['gateways'])
        configError("missing gateways section");
      _.forEach(configJson['gateways'], (function(v, k) {
        logger.debug(util.format("loading gateway: %s", k));
        var gatewayType = assert.type(v['type'], $traceurRuntime.type.string);
        if (gatewayType === "ArduinoSerialGateway") {
          var devices = assert.type([], $traceurRuntime.genericType(Array, gatewayModule.ArduinoDevice));
          _.forEach(v['devices'], (function(deviceConfig, deviceId) {
            var deviceInitString = assert.type(deviceConfig['initString'], $traceurRuntime.type.string);
            if (U.isNullOrUndefined(deviceInitString))
              deviceInitString = "";
            var device = assert.type(new gatewayModule.ArduinoDevice(deviceId, deviceInitString), gatewayModule.ArduinoDevice);
            devices.push(device);
          }));
          var initString = v['initString'];
          if (U.isNullOrUndefined(initString))
            configError(util.format("missing or invalid initString format. gateway %s", k));
          var serialPort = v['serialPort'];
          if (U.isNullOrUndefined(serialPort) || serialPort.toString().length === 0)
            configError(util.format("missing or invalid serialPort. gateway %s", k));
          var remoteSSH = v['remoteSSH'];
          var gateway = new gatewayModule.ArduinoSerialGateway(self.mqttClient, "", k, devices, serialPort, initString, remoteSSH);
          self.gateways.push(gateway);
        } else {
          configError(util.format("unknown or missing gateway type for gateway %s", k));
        }
      }));
    },
    loadj: function(configJson) {
      assert.argumentTypes(configJson, $traceurRuntime.type.any);
      var self = this;
      self.doLoad(configJson);
    },
    loads: function(str) {
      assert.argumentTypes(str, $traceurRuntime.type.string);
      var configJson = JSON.parse(str);
      return this.loadj(configJson);
    },
    loadf: function(file) {
      assert.argumentTypes(file, $traceurRuntime.type.string);
      return this.loads(fs.readFileSync(file, 'utf8'));
    }
  }, {});
}());
Object.defineProperties(module.exports, {
  Config: {get: function() {
      return Config;
    }},
  __esModule: {value: true}
});
//# sourceMappingURL=config.js.map
