"use strict";

var assert = require('chai').assert;
var events = require('events');
var mqtt = require ('mqtt');
var winston = require('winston');
var fs = require('fs');
var tty = require('tty');
var util = require('util');
var split = require('split');
var yargs = require('yargs');
var winston_syslog = require('winston-syslog');
var os = require('os');
var _ = require('lodash');

var U = require ('./u');
var gatewayModule = require('./gateway');

var logging = require('./logging');
var logger = new logging.Logger(__filename);

var configError = function (msg:string) {
  console.error("config error: " + msg);
  process.exit(10);
};

export class Config {
  mqttClient:mqtt.Client;
  gateways:Array<gatewayModule.Gateway> = [];

  constructor() {
  }

  doLoad(configJson:any) {
    var self = this;

    //--------------------------------------------------------------------------
    //      load mqtt settings
    //--------------------------------------------------------------------------
    logger.debug(util.format("loading mqtt settings"));

    if (!configJson['mqtt'])
      configError("missing mqtt section");

    var mqttOptions = configJson['mqtt']['options'];
    if (!mqttOptions)
      configError("missing mqtt options section");

    this.mqttClient = mqtt.connect(mqttOptions);

    //--------------------------------------------------------------------------
    //      load gateway list
    //--------------------------------------------------------------------------
    logger.debug(util.format("loading gateways"));

    this.gateways = [];

    if (!configJson['gateways'])
      configError("missing gateways section");
    _.forEach(configJson['gateways'], (v, k) => {
      logger.debug(util.format("loading gateway: %s", k));

      var gatewayType:string = v['type'];

      if (gatewayType === "ArduinoSerialGateway") {

        var devices:Array<gatewayModule.ArduinoDevice> = [];
        _.forEach(v['devices'], (deviceConfig,deviceId) => {
          var deviceInitString:string = deviceConfig['initString'];
          if (U.isNullOrUndefined(deviceInitString))
            deviceInitString = "";
          var device:gatewayModule.ArduinoDevice = new gatewayModule.ArduinoDevice(deviceId, deviceInitString);
          devices.push(device);
        });

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
    });
  }

  loadj(configJson:any) {
    var self = this;

    self.doLoad(configJson);
  }


  loads(str:string) {

    var configJson = JSON.parse(str);
    return this.loadj(configJson);
  }

  loadf(file:string) {
    return this.loads(fs.readFileSync(file, 'utf8'));
  }
}
