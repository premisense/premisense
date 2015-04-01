///<reference path="externals.d.ts"/>
import events = require('events')
import mqtt = require('mqtt')
import Q = require('q')
import fs = require('fs')
import tty = require('tty')
import util = require('util')
import split = require('split')
import yargs = require('yargs')
import winston = require('winston');
import os = require('os')
import _ = require('lodash')

import U = require('./u')
import gatewayModule = require('./gateway');

import logging = require('./logging');
var logger = new logging.Logger(__filename);

//----------------------------------------------------------------------------------------
winston.setLevels({
  debug: 0,
  info: 1,
  notice: 2,
  warning: 3,
  error: 4,
  crit: 5,
  alert: 6,
  emerg: 7
});
winston.addColors({
  debug: 'green',
  info: 'cyan',
  silly: 'magenta',
  warn: 'yellow',
  error: 'red'
});

//--------------------------------------------------------------------------
//      define command line parser
//--------------------------------------------------------------------------
var packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

var args:{[key:string]: any } = yargs
    .usage("Usage: $0 -f config [options]")
    .help('h')
    .alias('h', 'help')
    .option('v', {
      alias: 'version',
      demand: false,
      describe: 'display package version'
    })
    .option('d', {
      alias: 'debug',
      demand: false,
      describe: 'debug logging'
    })
    .option('q', {
      alias: 'quiet',
      demand: false,
      describe: 'do not log to console'
    })
    .option('c', {
      alias: 'config',
      demand: false,
      'default': '/etc/sensord.conf',
      describe: 'config file',
      type: 'string'
    })
    .strict()
    .parse(process.argv)
  ;

if (args['v']) {
  console.log("v" + packageJson.version);
  process.exit(0);
}

var debugLog = (args['d']) ? true : false;

winston.remove(winston.transports.Console);
if (!args['q']) {
  var colorize : boolean = tty.isatty(1);
  winston.add(winston.transports.Console, {level: (debugLog) ? 'debug' : 'info', colorize: colorize});

}

//--------------------------------------------------------------------------
//      load config file
//--------------------------------------------------------------------------

var configJson = JSON.parse(fs.readFileSync(args['c'], 'utf8'));

var configError = (msg:string) => {
  console.error("config error: " + msg);
  process.exit(1);
};

//--------------------------------------------------------------------------
//      load mqtt settings
//--------------------------------------------------------------------------
logger.debug(util.format("loading mqtt settings"));

if (!configJson['mqtt'])
  configError("missing mqtt section");

var mqttOptions = configJson['mqtt']['options'];
if (!mqttOptions)
  configError("missing mqtt options section");

var mqttClient:mqtt.Client = mqtt.connect(mqttOptions);


//--------------------------------------------------------------------------
//      load gateway list
//--------------------------------------------------------------------------
logger.debug(util.format("loading gateways"));

var gateways:gatewayModule.Gateway[] = [];

if (!configJson['gateways'])
  configError("missing gateways section");
_.forEach(configJson['gateways'], (v, k) => {
  logger.debug(util.format("loading gateway: %s", k));

  var gatewayType:string = v['type'];

  if (gatewayType === "ArduinoSerialGateway") {

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

    var gateway = new gatewayModule.ArduinoSerialGateway(mqttClient, "", k, devices, serialPort, initString, remoteSSH);

    gateways.push(gateway);

  } else {
    configError(util.format("unknown or missing gateway type for gateway %s", k));
  }
});


//--------------------------------------------------------------------------
logger.debug("waiting for mqtt connection");


mqttClient.once('connect', () => {
  logger.debug("connected to mqtt. starting gateways...");

  var startGateways:Q.Promise<boolean>[] = [];
  _.forEach(gateways, (gw) => {
    startGateways.push(gw.start());
  }, this);

  Q.allSettled(startGateways)
    .then(() => {
      logger.info("service started");
    });

});
