///<reference path="externals.d.ts"/>
import events = require('events')
import mqtt = require('mqtt')
import Q = require('q')
import fs = require('fs')
import tty = require('tty')
import util = require('util')
import split = require('split')
import yargs = require('yargs')
import winston = require('winston')
import winston_syslog = require('winston-syslog')
import os = require('os')
import _ = require('lodash')

import U = require('./u')
import gatewayModule = require('./gateway');

import logging = require('./logging');
var logger = new logging.Logger(__filename);

var configError = (msg:string) => {
  console.error("config error: " + msg);
  process.exit(10);
};

export class Config {
  mqttClient:mqtt.Client;
  gateways:gatewayModule.Gateway[] = [];

  constructor() {
  }

  private doLoad(configJson:any) {
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

        var disabled = v['disabled'];
        if (!U.isNullOrUndefined(disabled)) {
          return;
        }

        var devices:gatewayModule.ArduinoDevice[] = [];
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
