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

// the below exposes the Syslog transport
var syslog = winston_syslog.Syslog;
process.title = "sensord";
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
    .option('l', {
      alias: 'log',
      demand: false,
      describe: 'add (winston) log transport. available transports: console:options | file:options | syslog:options | DailyRotateFile:options',
      type: 'string'
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

var cliError = (msg:string) => {
  console.error("CLI error: " + msg);
  process.exit(10);
};


if (args['v']) {
  console.log("v" + packageJson.version);
  process.exit(0);
}

var debugLog = (args['d']) ? true : false;

winston.remove(winston.transports.Console);

var appendTransport = (transportType:string, options?:any):boolean =>  {
  transportType = transportType.toLowerCase();

  if (_.isString(options)) {
    options = JSON.parse(options);
  }

  if (transportType === 'console') {
    if (U.isNullOrUndefined(options)) {
      var colorize : boolean = tty.isatty(1);
      options = {level: (debugLog) ? 'debug' : 'info', colorize: colorize};
    }

    winston.add(winston.transports.Console, options);
    return true;

  } else if (transportType === 'file') {
    winston.add(winston.transports.File, options);
    return true;

  } else if (transportType === 'dailyrotatefile') {
    winston.add(winston.transports.DailyRotateFile, options);
    return true;

  } else if (transportType === 'syslog') {
    var transports:any;
    transports = winston.transports;
    winston.add(transports.Syslog, options);
    return true;

  }

  return false;
};

if (!args['l']) {
  appendTransport('console');
} else {
  var logTransports = args['l'];
  if (!_.isArray(logTransports)) {
    logTransports = [logTransports];
  }

  _.forEach(logTransports, (logTransportParam:string) => {
    var pos = logTransportParam.indexOf(':');
    var transportType:string;
    var transportOptions:any;
    if (pos > 0) {
      transportType = logTransportParam.substr(0, pos);
      transportOptions = logTransportParam.substr(pos+1);
    } else {
      transportType = logTransportParam;
    }
    if (!appendTransport(transportType, transportOptions)) {
      cliError("failed to add transport: " + logTransportParam);
    }
  });
}

//--------------------------------------------------------------------------
//      load config file
//--------------------------------------------------------------------------

var configJson = JSON.parse(fs.readFileSync(args['c'], 'utf8'));

var configError = (msg:string) => {
  console.error("config error: " + msg);
  process.exit(10);
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
