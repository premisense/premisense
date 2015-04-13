var _this = this;
var mqtt = require('mqtt');
var Q = require('q');
var fs = require('fs');
var tty = require('tty');
var util = require('util');
var yargs = require('yargs');
var winston = require('winston');
var winston_syslog = require('winston-syslog');
var _ = require('lodash');
var U = require('./u');
var gatewayModule = require('./gateway');
var logging = require('./logging');
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
var args = yargs.usage("Usage: $0 -f config [options]").help('h').alias('h', 'help').option('v', {
    alias: 'version',
    demand: false,
    describe: 'display package version'
}).option('d', {
    alias: 'debug',
    demand: false,
    describe: 'debug logging'
}).option('l', {
    alias: 'log',
    demand: false,
    describe: 'add (winston) log transport. available transports: console:options | file:options | syslog:options | DailyRotateFile:options',
    type: 'string'
}).option('c', {
    alias: 'config',
    demand: false,
    'default': '/etc/sensord.conf',
    describe: 'config file',
    type: 'string'
}).strict().parse(process.argv);
var cliError = function (msg) {
    console.error("CLI error: " + msg);
    process.exit(10);
};
if (args['v']) {
    console.log("v" + packageJson.version);
    process.exit(0);
}
var debugLog = (args['d']) ? true : false;
winston.remove(winston.transports.Console);
var appendTransport = function (transportType, options) {
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
            var colorize = tty.isatty(1);
            options.colorize = colorize;
        }
        winston.add(winston.transports.Console, options);
        return true;
    }
    else if (transportType === 'file') {
        winston.add(winston.transports.File, options);
        return true;
    }
    else if (transportType === 'dailyrotatefile') {
        winston.add(winston.transports.DailyRotateFile, options);
        return true;
    }
    else if (transportType === 'syslog') {
        options.json = false;
        var transports;
        transports = winston.transports;
        winston.add(transports.Syslog, options);
        return true;
    }
    return false;
};
if (!args['l']) {
    appendTransport('console');
}
else {
    var logTransports = args['l'];
    if (!_.isArray(logTransports)) {
        logTransports = [logTransports];
    }
    _.forEach(logTransports, function (logTransportParam) {
        var pos = logTransportParam.indexOf(':');
        var transportType;
        var transportOptions;
        if (pos > 0) {
            transportType = logTransportParam.substr(0, pos);
            transportOptions = logTransportParam.substr(pos + 1);
        }
        else {
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
var configError = function (msg) {
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
var mqttClient = mqtt.connect(mqttOptions);
//--------------------------------------------------------------------------
//      load gateway list
//--------------------------------------------------------------------------
logger.debug(util.format("loading gateways"));
var gateways = [];
if (!configJson['gateways'])
    configError("missing gateways section");
_.forEach(configJson['gateways'], function (v, k) {
    logger.debug(util.format("loading gateway: %s", k));
    var gatewayType = v['type'];
    if (gatewayType === "ArduinoSerialGateway") {
        var devices = [];
        _.forEach(v['devices'], function (deviceConfig, deviceId) {
            var deviceInitString = deviceConfig['initString'];
            if (U.isNullOrUndefined(deviceInitString))
                deviceInitString = "";
            var device = new gatewayModule.ArduinoDevice(deviceId, deviceInitString);
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
    }
    else {
        configError(util.format("unknown or missing gateway type for gateway %s", k));
    }
});
//--------------------------------------------------------------------------
logger.debug("waiting for mqtt connection");
mqttClient.once('connect', function () {
    logger.debug("connected to mqtt. starting gateways...");
    var startGateways = [];
    _.forEach(gateways, function (gw) {
        startGateways.push(gw.start());
    }, _this);
    Q.allSettled(startGateways).then(function () {
        logger.info("service started");
    });
});
//# sourceMappingURL=sensord.js.map