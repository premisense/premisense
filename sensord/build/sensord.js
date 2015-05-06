var _this = this;
var Q = require('q');
var fs = require('fs');
var tty = require('tty');
var yargs = require('yargs');
var winston = require('winston');
var winston_syslog = require('winston-syslog');
var _ = require('lodash');
var daemon = require('daemon');
var U = require('./u');
var config = require('./config');
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
}).option('b', {
    alias: 'background',
    demand: false,
    describe: 'daemon mode'
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
}).option('p', {
    alias: 'pidfile',
    demand: false,
    describe: 'create pid file',
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
var cfg = new config.Config();
cfg.loadf(args['c']);
//--------------------------------------------------------------------------
if (args['b']) {
    daemon();
}
//--------------------------------------------------------------------------
if (args['p']) {
    fs.writeFileSync(args['p'], process.pid.toString());
}
//--------------------------------------------------------------------------
logger.debug("waiting for mqtt connection");
cfg.mqttClient.once('connect', function () {
    logger.debug("connected to mqtt. starting gateways...");
    var startGateways = [];
    _.forEach(cfg.gateways, function (gw) {
        startGateways.push(gw.start());
    }, _this);
    Q.allSettled(startGateways).then(function () {
        logger.info("service started");
    });
});
//# sourceMappingURL=sensord.js.map