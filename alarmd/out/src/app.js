"use strict";
var assert = require('chai').assert;
var events = require('events');
var through = require('through');
var fs = require('fs');
var tty = require('tty');
var util = require('util');
var yargs = require('yargs');
var _ = require('lodash');
var winston = require('winston');
var winston_syslog = require('winston-syslog');
var os = require('os');
var Q = require('q');
var daemon = require('daemon');
var U = require('./u');
var itemModule = require('./item');
var arming = require('./arming');
var hubModule = require('./hub');
var auth = require('./auth');
var serviceModule = require('./service');
var web_service = require('./web_service');
var push_notification = require("./push_notification");
var event_log = require('./event_log');
var sensor_history = require('./sensor_history');
var config = require('./config');
var Hub = hubModule.Hub;
var MqttHub = hubModule.MqttHub;
var logging = require('./logging');
var logger = new logging.Logger(__filename);
process.on('uncaughtException', (function(err) {
  logger.error("uncaught exception: err: %s, stack:%s", err, err.stack);
  process.exit(1);
}));
var syslog = winston_syslog.Syslog;
process.title = "alarmd";
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
var packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
var args = yargs.usage("Usage: $0 -c config [options]").help('h').alias('h', 'help').option('v', {
  alias: 'version',
  demand: false,
  describe: 'display package version'
}).option('d', {
  alias: 'debug',
  demand: false,
  describe: 'debug logging'
}).option('b', {
  alias: 'background',
  demand: false,
  describe: 'daemon mode'
}).option('l', {
  alias: 'log',
  demand: false,
  describe: 'add (winston) log transport. available transports: console:options | file:options | syslog:options | DailyRotateFile:options',
  type: 'string'
}).option('m', {
  alias: 'module',
  demand: false,
  describe: 'per module log level. e.g. "-m item:debug"'
}).option('c', {
  alias: 'config',
  demand: false,
  'default': '/etc/alarmd.conf',
  describe: 'config file',
  type: 'string'
}).option('p', {
  alias: 'pidfile',
  demand: false,
  describe: 'create pid file',
  type: 'string'
}).strict().parse(process.argv);
;
if (args['m']) {
  var logParams = args['m'];
  if (!_.isArray(logParams))
    logParams = [args['m']];
  _.forEach(logParams, (function(x) {
    var params = x.split(':');
    if (params.length !== 2) {
      cliError(util.format("invalid log format(%s). expecting ':' separator. example: -l item:info", x));
    }
    var w = assert.type(winston, $traceurRuntime.type.any);
    var levelNumber = w.levels[params[1]];
    if (_.isUndefined(levelNumber)) {
      cliError(util.format("invalid log format(%s). unknown level", x));
    }
    if (!w.moduleLevels)
      w.moduleLevels = {};
    w.moduleLevels[params[0].toLowerCase()] = levelNumber;
  }));
}
if (args['v']) {
  console.log("v" + packageJson.version);
  process.exit(0);
}
var cliError = (function(msg) {
  console.error("CLI error: " + msg);
  process.exit(10);
});
var debugLog = (args['d']) ? true : false;
winston.remove(winston.transports.Console);
function appendTransport(transportType) {
  var options = arguments[1];
  assert.argumentTypes(transportType, $traceurRuntime.type.string, options, $traceurRuntime.type.any);
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
      var colorize = assert.type(tty.isatty(1), $traceurRuntime.type.boolean);
      options["colorize"] = colorize;
    }
    winston.add(winston.transports.Console, options);
    return assert.returnType((true), $traceurRuntime.type.boolean);
  } else if (transportType === 'file') {
    winston.add(winston.transports.File, options);
    return assert.returnType((true), $traceurRuntime.type.boolean);
  } else if (transportType === 'dailyrotatefile') {
    winston.add(winston.transports.DailyRotateFile, options);
    return assert.returnType((true), $traceurRuntime.type.boolean);
  } else if (transportType === 'syslog') {
    options.json = false;
    var transports;
    transports = winston.transports;
    winston.add(transports.Syslog, options);
    return assert.returnType((true), $traceurRuntime.type.boolean);
  }
  return assert.returnType((false), $traceurRuntime.type.boolean);
}
Object.defineProperty(appendTransport, "parameters", {get: function() {
    return [[$traceurRuntime.type.string], [$traceurRuntime.type.any]];
  }});
if (!args['l']) {
  appendTransport('console');
} else {
  var logTransports = args['l'];
  if (!_.isArray(logTransports)) {
    logTransports = [logTransports];
  }
  _.forEach(logTransports, (function(logTransportParam) {
    var pos = logTransportParam.indexOf(':');
    var transportType;
    var transportOptions;
    if (pos > 0) {
      transportType = logTransportParam.substr(0, pos);
      transportOptions = logTransportParam.substr(pos + 1);
    } else {
      transportType = logTransportParam;
    }
    if (!appendTransport(transportType, transportOptions)) {
      cliError("failed to add transport: " + logTransportParam);
    }
  }));
}
var cfg = assert.type(new config.Config(), config.Config);
var service = assert.type(cfg.loadf(args['c']), serviceModule.Service);
if (args['b']) {
  daemon();
}
if (args['p']) {
  fs.writeFileSync(args['p'], process.pid.toString());
}
service.start();
//# sourceMappingURL=app.js.map
