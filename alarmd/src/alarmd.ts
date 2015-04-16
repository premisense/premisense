///<reference path="externals.d.ts"/>
import events = require('events')
import through = require('through')
import fs = require('fs')
import tty = require('tty')
import util = require('util')
import yargs = require('yargs')
import _ = require('lodash')
import winston = require('winston');
import winston_syslog = require('winston-syslog')
import os = require('os')
import Q = require('q')

import U = require('./u')
import itemModule = require('./item')
import arming = require('./arming')
import hubModule = require('./hub')
import auth = require('./auth')
import serviceModule = require('./service')
import web_service = require('./web_service')
import push_notification = require("./push_notification")
import event_log = require('./event_log')
import sensor_history = require('./sensor_history')
import config = require('./config')

import Hub = hubModule.Hub;
import MqttHub = hubModule.MqttHub;


import logging = require('./logging');
var logger = new logging.Logger(__filename);

process.on('uncaughtException', (err) => {
  logger.error("uncaught exception: err: %s, stack:%s", err, err.stack);
  process.exit(1);
});


// the below exposes the Syslog transport
var syslog = winston_syslog.Syslog;
process.title = "alarmd";

//--------------------------------------------------------------------------
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
    .usage("Usage: $0 -c config [options]")
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
    .option('m', {
      alias: 'module',
      demand: false,
      describe: 'per module log level. e.g. "-m item:debug"'
    })
    .option('c', {
      alias: 'config',
      demand: false,
      'default': '/etc/alarmd.conf',
      describe: 'config file',
      type: 'string'
    })
    .strict()
    .parse(process.argv)
  ;

if (args['m']) {
  var logParams = args['m'];
  if (!_.isArray(logParams))
    logParams = [args['m']];
  _.forEach(logParams, (x:string) => {
    var params = x.split(':');
    if (params.length !== 2) {
      cliError(util.format("invalid log format(%s). expecting ':' separator. example: -l item:info", x));
    }

    var w:any = winston;
    var levelNumber = w.levels[params[1]];
    if (_.isUndefined(levelNumber)) {
      cliError(util.format("invalid log format(%s). unknown level", x));
    }

    if (!w.moduleLevels)
      w.moduleLevels = {};
    w.moduleLevels[params[0].toLowerCase()] = levelNumber;
  });
}

if (args['v']) {
  console.log("v" + packageJson.version);
  process.exit(0);
}

var cliError = (msg:string) => {
  console.error("CLI error: " + msg);
  process.exit(10);
};


var debugLog = (args['d']) ? true : false;

winston.remove(winston.transports.Console);

var appendTransport = (transportType:string, options?:any):boolean =>  {
  transportType = transportType.toLowerCase();

  if (_.isString(options)) {
    options = JSON.parse(options);
  }
  if (U.isNullOrUndefined(options)) {
    options = {};
  }
  options.level = (debugLog) ? 'debug' : 'info';

  if (transportType === 'console') {
    if (U.isNullOrUndefined(options['colorize'])) {
      var colorize : boolean = tty.isatty(1);
      options.colorize = colorize;
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
    options.json = false;
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

var cfg:config.Config = new config.Config();
var service:serviceModule.Service = cfg.loadf(args['c']);

//--------------------------------------------------------------------------

service.start();
