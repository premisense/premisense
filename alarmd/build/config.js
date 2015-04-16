///<reference path="externals.d.ts"/>
var util = require('util');
var fs = require('fs');
var _ = require('lodash');
var express = require('express');
var mqtt = require('mqtt');
var U = require('./u');
var itemModule = require('./item');
var hubModule = require('./hub');
var arming = require('./arming');
var auth = require('./auth');
var web_service = require('./web_service');
var push_notification = require('./push_notification');
var event_log = require('./event_log');
var sensor_history = require('./sensor_history');
var di = require('./domain_info');
var serviceModule = require('./service');
var logging = require('./logging');
var ruleEngineModule = require('./rule_engine');
var logger = new logging.Logger(__filename);
var MqttHub = hubModule.MqttHub;
function configError(msg) {
    console.error("config error: " + msg);
    process.exit(10);
}
var Config = (function () {
    function Config(file) {
        this.file = file;
    }
    Config.prototype.doLoad = function () {
        var self = this;
        //TODO check if file cannot be opened
        var configJson = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        //--------------------------------------------------------------------------
        //      collection of all groups
        //--------------------------------------------------------------------------
        var groups = {
            'all': this.systemItems.all,
            'armed': this.systemItems.armed,
            'tamper': this.systemItems.tamper,
            'delayedSiren': this.systemItems.delayedSiren,
            'delayedArmed': this.systemItems.delayedArmed,
            'monitor': this.systemItems.monitor
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
        var mqttClient = mqtt.connect(mqttOptions);
        //--------------------------------------------------------------------------
        //      load armed states
        //--------------------------------------------------------------------------
        logger.debug(util.format("loading armed states"));
        var armedStatesArray = [];
        if (!configJson['armedStates'])
            configError("missing armedStates section");
        _.forEach(configJson['armedStates'], function (v, k) {
            logger.debug(util.format("loading armed state: %s", k));
            if (groups[k])
                configError(util.format("armedState %s is already defined as a group. use a different name"));
            var armedStateOptions = {
                id: k,
                systemItems: self.systemItems,
                securityLevel: v['securityLevel'],
                order: v['order'],
                timeout: v['timeout'],
                sirenDelay: v['sirenDelay'],
                metadata: v['metadata']
            };
            itemModule.transaction(function () {
                var armedState = new arming.ArmedState(armedStateOptions);
                armedStatesArray.push(armedState);
                groups[k] = armedState;
            });
        });
        if (armedStatesArray.length == 0)
            configError("empty armedStates section");
        var armedStates;
        itemModule.transaction(function () {
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
        _.forEach(configJson['groups'], function (v, k) {
            logger.debug(util.format("loading group %s", k));
            if (groups[k])
                configError(util.format("group %s already exists or is a system group", k));
            var parentGroupNames = v['groups'];
            if (U.isNullOrUndefined(parentGroupNames))
                parentGroupNames = [];
            if (!_.isArray(parentGroupNames))
                configError(util.format("group %s: groups must be an array", k));
            var parentGroups = [];
            _.forEach(parentGroupNames, function (g) {
                if (!groups[g])
                    configError(util.format("group: %s: group %s is not defined", k, g));
                parentGroups.push(groups[g]);
            });
            var groupOptions = {
                id: k,
                name: v['name'],
                groups: _.uniq(parentGroups),
                metadata: v['metadata'],
                disabled: v['disabled']
            };
            itemModule.transaction(function () {
                var group = new itemModule.Group(groupOptions);
                groups[group.id] = group;
            });
        });
        //--------------------------------------------------------------------------
        //      load hubs & sensors
        //--------------------------------------------------------------------------
        var allSensors = {};
        var hubs = [];
        logger.debug(util.format("loading hubs"));
        if (!configJson['hubs'])
            configError("missing hubs section");
        _.forEach(configJson['hubs'], function (v, k) {
            logger.debug(util.format("loading hub %s", k));
            if (_.filter(hubs, function (h) {
                return h.id == k;
            }).length > 0)
                configError(util.format("duplicate hub %s", k));
            var devicesSection = v['devices'];
            if (!_.isObject(devicesSection))
                configError(util.format("hub %s: expecting a devices object", k));
            var devices = [];
            _.forEach(devicesSection, function (dv, dk) {
                var sensors = [];
                _.forEach(dv, function (sv, sk) {
                    logger.debug(util.format("loading hub %s, device:%s, sensor: %s", k, dk, sk));
                    if (allSensors[sk.toString()])
                        configError(util.format("hub %s: device:%s, sensor: %s, already defined", k, dk, sk));
                    var sensorName = sv['name'];
                    var groupNames = sv['groups'];
                    var sensorDisabled = sv['disabled'];
                    var sensorMetadata = sv['metadata'];
                    var sensorGroups = [];
                    if (groupNames) {
                        if (!_.isArray(groupNames))
                            configError(util.format("hub %s: device:%s, sensor: %s, groups must be an array", k, dk, sk));
                        _.forEach(groupNames, function (groupName) {
                            if (!groups[groupName.toString()])
                                configError(util.format("hub %s: device:%s, sensor: %s, no such group. %s", k, dk, sk, groupName));
                            sensorGroups.push(groups[groupName.toString()]);
                        });
                    }
                    var sensorType = sv['type'];
                    if (sensorType == 'ArduinoInputPullupSensor') {
                        var gpioId = parseInt(sv['gpioId']);
                        itemModule.transaction(function () {
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
                    }
                    else {
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
            }
            else {
                configError(util.format("hub %s: unknown type", k));
            }
        });
        //--------------------------------------------------------------------------
        //      load auth
        //--------------------------------------------------------------------------
        var usersArray = [];
        var bypassAuthIps = {};
        logger.debug(util.format("loading users"));
        if (!configJson['auth'])
            configError("missing auth section");
        if (!configJson['auth']['bypassAuthIps'])
            configError("missing bypassAuthIps section");
        _.forEach(configJson['auth']['bypassAuthIps'], function (v, k) {
            bypassAuthIps[k] = v == true;
        });
        if (!configJson['auth']['users'])
            configError("missing users section");
        _.forEach(configJson['auth']['users'], function (v, k) {
            logger.debug(util.format("loading user %s", k));
            var userOptions = {
                id: k,
                name: v['name'],
                metadata: v['metadata'],
                disabled: v['disabled'],
                password: v['password'],
                accessRestApi: true,
                pinCode: v['pinCode'],
                forcePinCode: v['forcePinCode']
            };
            itemModule.transaction(function () {
                var user = new auth.User(userOptions);
                usersArray.push(user);
            });
        });
        var users;
        itemModule.transaction(function () {
            users = new auth.Users({ id: 'Users', users: usersArray, bypassAuthIps: bypassAuthIps });
        });
        //--------------------------------------------------------------------------
        //      load web service
        //--------------------------------------------------------------------------
        logger.debug(util.format("loading web service settings"));
        var port = 8282;
        if (configJson['webService']) {
            var webServiceSection = configJson['webService'];
            if (webServiceSection['port'])
                port = webServiceSection['port'];
        }
        var webServiceOptions = {
            port: port
        };
        var webService = new web_service.WebService(webServiceOptions);
        if (configJson['webService']) {
            var webServiceSection = configJson['webService'];
            _.forEach(webServiceSection['serve-static'], function (v, k) {
                var args = [];
                args.push(k);
                _.forEach(v['filters'], function (h) {
                    if (h === 'replaceFields') {
                        args.push(web_service.WebService.replaceFields);
                    }
                    else if (h === 'authFilter') {
                        args.push(web_service.WebService.authFilter);
                    }
                    else {
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
        var ruleEngine;
        itemModule.transaction(function () {
            ruleEngine = new ruleEngineModule.RuleEngine(self.systemItems);
        });
        itemModule.transaction(function () {
            ruleEngine.loadModule('./builtin_rules');
        });
        //TODO load more rules from plugins directory
        //--------------------------------------------------------------------------
        //      load push_notification
        //--------------------------------------------------------------------------
        var pushNotification = null;
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
                        pushNotificationOptions.defaultTitle = 'alarmd';
                    }
                    if (U.isNullOrUndefined(pushNotificationOptions['defaultPriority'])) {
                        pushNotificationOptions.defaultPriority = 0 /* NORMAL */;
                    }
                    if (U.isNullOrUndefined(pushNotificationOptions['prioritySoundMap'])) {
                        pushNotificationOptions.prioritySoundMap = {};
                        push_notification[2 /* CRITICAL */] = 'siren';
                    }
                    pushNotification = new push_notification.Pushover(pushNotificationOptions);
                }
                else {
                    configError(util.format("unknown push_notification type: %s", pushNotificationType));
                }
            }
        }
        //--------------------------------------------------------------------------
        //      load siren
        //--------------------------------------------------------------------------
        var siren = null;
        logger.debug(util.format("loading siren settings"));
        if (!configJson['siren']) {
            configError(util.format("missing siren section"));
        }
        else {
            var sirenSection = configJson['siren'];
            var sirenOptions = {
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
        //      load event_log settings
        //--------------------------------------------------------------------------
        var eventLogKeepDays = 30;
        logger.debug(util.format("loading event_log settings"));
        if (configJson['event_log']) {
            var eventLogSection = configJson['event_log'];
            if (!U.isNullOrUndefined(eventLogSection['keepDays'])) {
                eventLogKeepDays = parseInt(eventLogSection['keepDays']);
            }
        }
        //--------------------------------------------------------------------------
        //      load sensor_history settings
        //--------------------------------------------------------------------------
        var sensorHistoryKeepDays = 30;
        logger.debug(util.format("loading sensor_history settings"));
        if (configJson['sensor_history']) {
            var sensorHistorySection = configJson['sensor_history'];
            if (!U.isNullOrUndefined(sensorHistorySection['keepDays'])) {
                sensorHistoryKeepDays = parseInt(sensorHistorySection['keepDays']);
            }
        }
        //--------------------------------------------------------------------------
        //      initialize the service
        //--------------------------------------------------------------------------
        var serviceOptions = {
            mqttClient: mqttClient,
            items: self.systemItems,
            armedStates: armedStates,
            siren: siren,
            users: users,
            webService: webService,
            pushNotification: pushNotification,
            hubs: hubs,
            ruleEngine: ruleEngine,
            eventLog: new event_log.EventLog('event_log.dat', eventLogKeepDays),
            sensorHistory: new sensor_history.SensorHistory('sensor_history.dat', sensorHistoryKeepDays),
            domainInfo: di.active
        };
        var service;
        itemModule.transaction(function () {
            service = new serviceModule.Service(serviceOptions);
        });
        return service;
    };
    Config.prototype.load = function () {
        var domainInfo = di.create(null);
        var self = this;
        var service = null;
        domainInfo.domain.run(function () {
            domainInfo.itemEvents = new itemModule.ItemEvents();
            self.systemItems = new serviceModule.SystemItems();
            service = self.doLoad();
        });
        return service;
    };
    return Config;
})();
exports.Config = Config;
//# sourceMappingURL=config.js.map