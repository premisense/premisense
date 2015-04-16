var Q = require('q');
var assert = require('assert');
var _ = require('lodash');
var U = require('./u');
var itemModule = require('./item');
var hubModule = require('./hub');
var arming = require('./arming');
var web_service = require('./web_service');
var push_notification = require('./push_notification');
var event_log = require('./event_log');
var rule_engine = require('./rule_engine');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var Group = itemModule.Group;
var SystemItems = (function () {
    function SystemItems() {
        var _this = this;
        itemModule.transaction(function () {
            var all = new Group({ id: 'all' });
            _this._all = all;
            _this._armed = new Group({ id: 'armed', groups: [all] });
            _this._tamper = new Group({ id: 'tamper', groups: [all] });
            _this._delayedSiren = new Group({ id: 'delayedSiren', groups: [all] });
            _this._delayedArmed = new Group({ id: 'delayedArmed', groups: [all] });
            _this._monitor = new Group({ id: 'monitor', groups: [all] });
        }, this);
    }
    Object.defineProperty(SystemItems.prototype, "all", {
        get: function () {
            return this._all;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SystemItems.prototype, "armed", {
        get: function () {
            return this._armed;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SystemItems.prototype, "tamper", {
        get: function () {
            return this._tamper;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SystemItems.prototype, "delayedSiren", {
        get: function () {
            return this._delayedSiren;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SystemItems.prototype, "delayedArmed", {
        get: function () {
            return this._delayedArmed;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SystemItems.prototype, "monitor", {
        get: function () {
            return this._monitor;
        },
        enumerable: true,
        configurable: true
    });
    return SystemItems;
})();
exports.SystemItems = SystemItems;
var ServiceOptions = (function () {
    function ServiceOptions() {
    }
    return ServiceOptions;
})();
exports.ServiceOptions = ServiceOptions;
var Service = (function () {
    function Service(o) {
        assert(U.isNullOrUndefined(o.domainInfo.service));
        o.domainInfo.service = this;
        this._items = o.items;
        this._hubs = o.hubs;
        this._armedStates = o.armedStates;
        this._webService = o.webService;
        this._users = o.users;
        this._siren = o.siren;
        this._armedStates.addParent(o.items.all);
        this._ruleEngine = o.ruleEngine;
        this._pushNotification = o.pushNotification;
        this._eventLog = o.eventLog;
        this._sensorHistory = o.sensorHistory;
        this._domainInfo = o.domainInfo;
        this._mqttClient = o.mqttClient;
    }
    Object.defineProperty(Service.prototype, "pushNotification", {
        get: function () {
            return this._pushNotification;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Service.prototype, "ruleEngine", {
        get: function () {
            return this._ruleEngine;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Service.prototype, "users", {
        get: function () {
            return this._users;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Service.prototype, "armedStates", {
        get: function () {
            return this._armedStates;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Service.prototype, "items", {
        get: function () {
            return this._items;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Service.prototype, "siren", {
        get: function () {
            return this._siren;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Service.prototype, "eventLog", {
        get: function () {
            return this._eventLog;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Service.prototype, "sensorHistory", {
        get: function () {
            return this._sensorHistory;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Service.prototype, "webService", {
        get: function () {
            return this._webService;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Service.prototype, "mqttClient", {
        get: function () {
            return this._mqttClient;
        },
        enumerable: true,
        configurable: true
    });
    Service.prototype.start = function () {
        var _this = this;
        var deferred = Q.defer();
        logger.debug("waiting for mqtt connection");
        var started = false;
        var self = this;
        this._domainInfo.domain.run(function () {
            _this.mqttClient.on('connect', function () {
                if (!started) {
                    started = true;
                    logger.debug("connected to mqtt. starting service...");
                    self._start(deferred);
                    deferred.promise.then(function (result) {
                        if (result)
                            logger.info("service started");
                        else {
                            logger.info("failed to start service. exiting");
                            process.exit(1);
                        }
                    });
                }
                else {
                    logger.info("reconnected to mqtt. re-subscribing to topics...");
                }
            });
            self.mqttClient.on('disconnect', function () {
                logger.warn("disconnected from mqtt");
            });
            self.mqttClient.on('close', function () {
                logger.warn("mqtt closed connection");
            });
            self.mqttClient.on('error', function (err) {
                logger.warn("mqtt error: " + err);
            });
        });
        return deferred.promise;
    };
    Service.prototype._start = function (deferred) {
        var _this = this;
        var self = this;
        this.eventLog.start().then(function (result) {
            if (!result) {
                deferred.resolve(false);
            }
            else {
                _this.sensorHistory.start().then(function (result) {
                    if (!result) {
                        deferred.resolve(false);
                    }
                    else {
                        logger.info("activating armedState:%s", _this.armedStates.states[0].name);
                        _this.armedStates.states[0].activate().then(function () {
                            var startHubs = [];
                            logger.debug("starting hubs...");
                            _.forEach(self._hubs, function (hub) {
                                startHubs.push(hub.start());
                            }, self);
                            Q.allSettled(startHubs).then(function () {
                                logger.debug("starting rule engine...");
                                self._ruleEngine.start().then(function () {
                                    logger.debug("starting web service...");
                                    self._webService.start().then(function () {
                                        // first run
                                        self._ruleEngine.run();
                                        _this.eventLog.log(new event_log.Event({
                                            type: 'service',
                                            message: 'started',
                                            user: null,
                                            severity: 0 /* INFO */
                                        }));
                                        deferred.resolve(true);
                                    });
                                });
                            });
                        });
                    }
                });
            }
        });
    };
    return Service;
})();
exports.Service = Service;
//# sourceMappingURL=service.js.map