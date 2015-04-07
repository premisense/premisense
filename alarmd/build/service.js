var Q = require('q');
var assert = require('assert');
var _ = require('lodash');
var itemModule = require('./item');
var hubModule = require('./hub');
var arming = require('./arming');
var web_service = require('./web_service');
var push_notification = require('./push_notification');
var event_log = require('./event_log');
var rule_engine = require('./rule_engine');
var domain_info = require('./domain_info');
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
        this._events = itemModule.ItemEvents.instance;
        assert(Service._instance == null);
        Service._instance = this;
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
    }
    Object.defineProperty(Service, "instance", {
        get: function () {
            assert(Service._instance != null);
            return Service._instance;
        },
        enumerable: true,
        configurable: true
    });
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
    Object.defineProperty(Service.prototype, "events", {
        get: function () {
            return this._events;
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
    Service.prototype.start = function () {
        var deferred = Q.defer();
        domain_info.DomainInfo.global.user = this.users.getAdmin();
        this._start(deferred);
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
    Service._instance = null;
    return Service;
})();
exports.Service = Service;
//# sourceMappingURL=service.js.map