///<reference path="externals.d.ts"/>
import events = require('events')
import through = require('through')
import mqtt = require('mqtt')
import fs = require('fs')
import tty = require('tty')
import util = require('util')
import yargs = require('yargs')
import _ = require('lodash')
import winston = require('winston');
import winston_syslog = require('winston-syslog')
import os = require('os')
import Q = require('q')
import express = require('express')

import U = require('./u')
import itemModule = require('./item')
import arming = require('./arming')
import hubModule = require('./hub')
import auth = require('./auth')
import serviceModule = require('./service')
import web_service = require('./web_service')
import push_notification = require("./push_notification")
import ruleEngineModule = require('./rule_engine')
import event_log = require('./event_log')
import sensor_history = require('./sensor_history')

import Hub = hubModule.Hub;
import MqttHub = hubModule.MqttHub;


import logging = require('./logging');
var logger = new logging.Logger(__filename);

// the below exposes the Syslog transport
var syslog = winston_syslog.Syslog;
process.title = "alarmd";
var systemItems = new serviceModule.SystemItems();

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

var configJson = JSON.parse(fs.readFileSync(args['c'], 'utf8'));

var configError = (msg:string) => {
  console.error("config error: " + msg);
  process.exit(10);
};

//--------------------------------------------------------------------------
//      collection of all groups
//--------------------------------------------------------------------------
var groups:{[key:string]: itemModule.Group} = {
  'all': systemItems.all,
  'armed': systemItems.armed,
  'tamper': systemItems.tamper,
  'delayedSiren': systemItems.delayedSiren,
  'delayedArmed': systemItems.delayedArmed,
  'monitor': systemItems.monitor
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


_.defaults(mqttOptions, {
  clientId: 'alarmd',
  reconnectPeriod: 1000
});

var mqttClient:mqtt.Client = mqtt.connect(mqttOptions);

//--------------------------------------------------------------------------
//      load armed states
//--------------------------------------------------------------------------

logger.debug(util.format("loading armed states"));

var armedStatesArray:arming.ArmedState[] = [];
if (!configJson['armedStates'])
  configError("missing armedStates section");

_.forEach(configJson['armedStates'], (v, k) => {

  logger.debug(util.format("loading armed state: %s", k));

  if (groups[k])
    configError(util.format("armedState %s is already defined as a group. use a different name"));

  var armedStateOptions:arming.ArmedStateOptions = {
    id: k,
    systemItems: systemItems,
    securityLevel: v['securityLevel'],
    order: v['order'],
    timeout: v['timeout'],
    sirenDelay: v['sirenDelay'],
    metadata: v['metadata']
  };

  itemModule.transaction(() => {
    var armedState = new arming.ArmedState(armedStateOptions);
    armedStatesArray.push(armedState);
    groups[k] = armedState;
  });
});
if (armedStatesArray.length == 0)
  configError("empty armedStates section");

var armedStates;
itemModule.transaction(() => {
  armedStates = new arming.ArmedStates({
    id: 'ArmedStates',
    armedStates: armedStatesArray
  });
});

//--------------------------------------------------------------------------
//      load groups
//--------------------------------------------------------------------------

logger.debug(util.format("loading groups"));

if (!configJson['groups'])
  configError("missing groups section");
_.forEach(configJson['groups'], (v, k) => {
  logger.debug(util.format("loading group %s", k));

  if (groups[k])
    configError(util.format("group %s already exists or is a system group", k));

  var parentGroupNames:string[] = v['groups'];
  if (U.isNullOrUndefined(parentGroupNames))
    parentGroupNames = [];
  if (!_.isArray(parentGroupNames))
    configError(util.format("group %s: groups must be an array", k));

  var parentGroups:itemModule.Group[] = [];
  _.forEach(parentGroupNames, (g) => {
    if (!groups[g])
      configError(util.format("group: %s: group %s is not defined", k, g));
    parentGroups.push(groups[g]);
  });
  var groupOptions:itemModule.ItemOptions = {
    id: k,
    name: v['name'],
    groups: _.uniq(parentGroups),
    metadata: v['metadata'],
    disabled: v['disabled']
  };

  itemModule.transaction(() => {
    var group = new itemModule.Group(groupOptions);
    groups[group.id] = group;
  });
});

//--------------------------------------------------------------------------
//      load hubs & sensors
//--------------------------------------------------------------------------
var allSensors:{[key:string]: itemModule.Item} = {};
var hubs:hubModule.Hub[] = [];


logger.debug(util.format("loading hubs"));

if (!configJson['hubs'])
  configError("missing hubs section");

_.forEach(configJson['hubs'], (v, k) => {
  logger.debug(util.format("loading hub %s", k));

  if (_.filter(hubs, (h) => {
      return h.id == k
    }).length > 0)
    configError(util.format("duplicate hub %s", k));

  var devicesSection = v['devices'];
  if (!_.isObject(devicesSection))
    configError(util.format("hub %s: expecting a devices object", k));


  var devices:hubModule.MqttHubDevice[] = [];

  _.forEach(devicesSection, (dv, dk) => {
    var sensors:itemModule.Sensor[] = [];

    _.forEach(dv, (sv, sk) => {
      logger.debug(util.format("loading hub %s, device:%s, sensor: %s", k, dk, sk));

      if (allSensors[sk.toString()])
        configError(util.format("hub %s: device:%s, sensor: %s, already defined", k, dk, sk));

      var sensorName = sv['name'];
      var groupNames = sv['groups'];
      var sensorDisabled = sv['disabled'];
      var sensorMetadata = sv['metadata'];


      var sensorGroups:itemModule.Group[] = [];

      if (groupNames) {
        if (!_.isArray(groupNames))
          configError(util.format("hub %s: device:%s, sensor: %s, groups must be an array", k, dk, sk));

        _.forEach(groupNames, (groupName) => {
          if (!groups[groupName.toString()])
            configError(util.format("hub %s: device:%s, sensor: %s, no such group. %s", k, dk, sk, groupName));

          sensorGroups.push(groups[groupName.toString()]);

        });
      }

      var sensorType = sv['type'];
      if (sensorType == 'ArduinoInputPullupSensor') {
        var gpioId = parseInt(sv['gpioId']);

        itemModule.transaction(() => {
          var item = new itemModule.ArduinoInputPullupSensor({
            id: sk.toString(),
            gpioId: gpioId,
            name: sensorName,
            groups: sensorGroups,
            metadata: sensorMetadata,
            disabled: sensorDisabled == true
          });

          allSensors[sk.toString()] = item;
          sensors.push(item);
        });

      } else {
        configError(util.format("hub %s: device:%s, sensor: %s, unknown type", k, dk, sk));
      }
    });

    var device = new hubModule.MqttHubDevice({
      id: dk,
      sensors: sensors
    });

    devices.push(device);
  });


  var hubType = v['type'];
  if (hubType == 'mqtt') {
    var topic = v['topic'];

    var hub = new MqttHub({
      id: k.toString(),
      client: mqttClient,
      topicRoot: topic,
      devices: devices
    });

    hubs.push(hub);

  } else {
    configError(util.format("hub %s: unknown type", k));
  }

});
//--------------------------------------------------------------------------
//      load auth
//--------------------------------------------------------------------------
var usersArray:auth.User[] = [];
var bypassAuthIps:{[key:string]: boolean} = {};

logger.debug(util.format("loading users"));

if (!configJson['auth'])
  configError("missing auth section");

if (!configJson['auth']['bypassAuthIps'])
  configError("missing bypassAuthIps section");

_.forEach(configJson['auth']['bypassAuthIps'], (v, k) => {
  bypassAuthIps[k] = v == true;
});

if (!configJson['auth']['users'])
  configError("missing users section");
_.forEach(configJson['auth']['users'], (v, k) => {
  logger.debug(util.format("loading user %s", k));

  var userOptions:auth.UserOptions = {
    id: k,
    name: v['name'],
    metadata: v['metadata'],
    disabled: v['disabled'],
    password: v['password'],
    accessRestApi: true,
    pinCode: v['pinCode'],
    forcePinCode: v['forcePinCode']
  };

  itemModule.transaction(() => {
    var user = new auth.User(userOptions);
    usersArray.push(user);
  });
});

var users:auth.Users;

itemModule.transaction(() => {
  users = new auth.Users({id: 'Users', users: usersArray, bypassAuthIps: bypassAuthIps});
});

//--------------------------------------------------------------------------
//      load web service
//--------------------------------------------------------------------------
logger.debug(util.format("loading web service settings"));
var port:number = 8282;

if (configJson['webService']) {
  var webServiceSection = configJson['webService'];
  if (webServiceSection['port'])
    port = webServiceSection['port'];
}

var webServiceOptions:web_service.WebServiceOptions = {
  port: port
};

var webService:web_service.WebService = new web_service.WebService(webServiceOptions);

if (configJson['webService']) {
  var webServiceSection = configJson['webService'];
  _.forEach(webServiceSection['serve-static'], (v, k) => {
    var args:any = [];

    args.push(k);

    _.forEach(v['filters'], (h) => {
      if (h === 'replaceFields') {
        args.push(web_service.WebService.replaceFields);
      } else if (h === 'authFilter') {
        args.push(web_service.WebService.authFilter);
      } else {
        configError(util.format("unknown filter: %s", h));
      }
    });

    args.push(express.static(v['root'], v['options']));


    webService.app.use.apply(webService.app, args);
  });
}
//--------------------------------------------------------------------------
//      load rules
//--------------------------------------------------------------------------
var ruleEngine:ruleEngineModule.RuleEngine;

itemModule.transaction(() => {
  ruleEngine = new ruleEngineModule.RuleEngine(systemItems);
});

itemModule.transaction(() => {
  ruleEngine.loadModule('./builtin_rules');
});

//TODO load more rules from plugins directory

//--------------------------------------------------------------------------
//      load push_notification
//--------------------------------------------------------------------------
var pushNotification:push_notification.PushNotification = null;

logger.debug(util.format("loading push_notification settings"));
if (configJson['push_notification']) {
  var pushNotificationSection = configJson['push_notification'];
  var pushNotificationType = pushNotificationSection['type'];
  if (pushNotificationType !== '') {
    if (pushNotificationType == 'pushover') {
      var pushNotificationOptionsSection = pushNotificationSection['options'];
      var pushNotificationOptions = pushNotificationSection['options'] || {};
      if (U.isNullOrUndefined(pushNotificationOptions['defaultAppKey'])) {
        configError(util.format("defaultAppKey is required for pushover options section"));
      }
      if (U.isNullOrUndefined(pushNotificationOptions['defaultUserKey'])) {
        configError(util.format("defaultUserKey is required for pushover options section"));
      }
      if (U.isNullOrUndefined(pushNotificationOptions['defaultTitle'])) {
        pushNotificationOptions.defaultTitle = 'alarmd'
      }
      if (U.isNullOrUndefined(pushNotificationOptions['defaultPriority'])) {
        pushNotificationOptions.defaultPriority = push_notification.Priority.NORMAL;
      }

      if (U.isNullOrUndefined(pushNotificationOptions['prioritySoundMap'])) {
        pushNotificationOptions.prioritySoundMap = {};
        push_notification[push_notification.Priority.CRITICAL] = 'siren';
      }

      pushNotification = new push_notification.Pushover(pushNotificationOptions);
    } else {
      configError(util.format("unknown push_notification type: %s", pushNotificationType));
    }
  }
}
//--------------------------------------------------------------------------
//      load siren
//--------------------------------------------------------------------------
var siren:itemModule.Siren = null;

logger.debug(util.format("loading siren settings"));
if (!configJson['siren']) {
  configError(util.format("missing siren section"));
} else {
  var sirenSection = configJson['siren'];
  var sirenOptions:itemModule.SirenOptions = {
    id: 'Siren',
    maxActiveTime: !U.isNullOrUndefined(sirenSection['maxActiveTime']) ? sirenSection['maxActiveTime'] : 10 * 60,
    mqttClient: mqttClient,
    topic: !U.isNullOrUndefined(sirenSection['topic']) ? sirenSection['topic'] : "",
    activateCommand: !U.isNullOrUndefined(sirenSection['activateCommand']) ? sirenSection['activateCommand'] : "",
    deactivateCommand: !U.isNullOrUndefined(sirenSection['deactivateCommand']) ? sirenSection['deactivateCommand'] : ""
  };
  siren = new itemModule.Siren(sirenOptions);
}
//--------------------------------------------------------------------------

//--------------------------------------------------------------------------
//      initialize the service
//--------------------------------------------------------------------------
var serviceOptions:serviceModule.ServiceOptions = {
  items: systemItems,
  armedStates: armedStates,
  siren: siren,
  users: users,
  webService: webService,
  pushNotification: pushNotification,
  hubs: hubs,
  ruleEngine: ruleEngine,
  eventLog: new event_log.EventLog('event_log.dat'),
  sensorHistory: new sensor_history.SensorHistory('sensor_history.dat')
};

var service:serviceModule.Service;
itemModule.transaction(() => {
  service = new serviceModule.Service(serviceOptions);
});

//--------------------------------------------------------------------------

process.on('uncaughtException', (err) => {
  logger.error("uncaught exception: err: %s, stack:%s", err, err.stack);
  process.exit(1);
});

logger.debug("waiting for mqtt connection");

var started:boolean = false;

mqttClient.on('connect', () => {
  if (!started) {
    started = true;
    logger.debug("connected to mqtt. starting service...");
    service.start()
      .then((result) => {
        if (result)
          logger.info("service started");
        else {
          logger.info("failed to start service. exiting");
          process.exit(1);
        }
      })
  } else {
    logger.info("reconnected to mqtt. re-subscribing to topics...");
  }
});

mqttClient.on('disconnect', () => {
  logger.warn("disconnected from mqtt");
});
mqttClient.on('close', () => {
  logger.warn("mqtt closed connection");
});

mqttClient.on('error', (err) => {
  logger.warn("mqtt error: " + err);
});

