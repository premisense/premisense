var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var assert = require('assert');
var Q = require('q');
var _ = require('lodash');
var U = require('./u');
var itemModule = require('./item');
var service = require('./service');
var event_log = require('./event_log');
var domain_info = require('./domain_info');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var Group = itemModule.Group;
var transaction = itemModule.transaction;
var WouldTriggerItem = (function () {
    function WouldTriggerItem(item) {
        this.count = 1;
        this.firstTriggered = new Date();
        this.lastTriggered = this.firstTriggered;
    }
    WouldTriggerItem.prototype.toJson = function () {
        return {
            'count': this.count,
            'firstTriggered': Math.floor(this.firstTriggered.valueOf() / 1000),
            'lastTriggered': Math.floor(this.lastTriggered.valueOf() / 1000)
        };
    };
    return WouldTriggerItem;
})();
exports.WouldTriggerItem = WouldTriggerItem;
var TriggeredItem = (function () {
    function TriggeredItem(item) {
        this.count = 1;
        this.firstTriggered = new Date();
        this.lastTriggered = this.firstTriggered;
    }
    TriggeredItem.prototype.toJson = function () {
        return {
            'count': this.count,
            'firstTriggered': Math.floor(this.firstTriggered.valueOf() / 1000),
            'lastTriggered': Math.floor(this.lastTriggered.valueOf() / 1000)
        };
    };
    return TriggeredItem;
})();
exports.TriggeredItem = TriggeredItem;
var ArmedState = (function (_super) {
    __extends(ArmedState, _super);
    function ArmedState(o) {
        _super.call(this, o);
        this.sirenDelay = 0;
        this._startTime = null;
        this.lastSiren = null;
        this.triggeredItems = {};
        this.wouldTriggerItems = {};
        this.bypassedItems = {};
        this.securityLevel = !U.isNullOrUndefined(o.securityLevel) ? o.securityLevel : 0;
        this.order = !U.isNullOrUndefined(o.order) ? o.order : 0;
        this.timeout = !U.isNullOrUndefined(o.timeout) ? o.timeout : 0;
        this.sirenDelay = !U.isNullOrUndefined(o.sirenDelay) ? o.sirenDelay : 0;
        this.addParent(o.systemItems.all);
        o.systemItems.tamper.addParent(this);
    }
    Object.defineProperty(ArmedState.prototype, "startTime", {
        get: function () {
            return this._startTime;
        },
        set: function (newStartTime) {
            this._startTime = newStartTime;
            this._checkNotifyChangedTimeLeft();
        },
        enumerable: true,
        configurable: true
    });
    ArmedState.prototype._checkNotifyChangedTimeLeft = function () {
        var self = this;
        if (this.timeLeft > 0) {
            Q.delay(500).then(function () {
                itemModule.transaction(function () {
                    self.notifyChanged();
                    self._checkNotifyChangedTimeLeft();
                });
            });
        }
    };
    Object.defineProperty(ArmedState.prototype, "timeLeft", {
        get: function () {
            if (this.startTime == null)
                return 0;
            var left = Math.floor((this.startTime.valueOf() - Date.now()) / 1000);
            return (left < 0) ? 0 : left;
        },
        enumerable: true,
        configurable: true
    });
    ArmedState.prototype.toJson = function () {
        var ret = _super.prototype.toJson.call(this);
        ret['type'] = 'ArmedState';
        ret['securityLevel'] = this.securityLevel;
        ret['order'] = this.order;
        ret['startTime'] = (this.startTime == null) ? null : this.startTime.valueOf;
        ret['armingTimeLeft'] = this.timeLeft;
        ret['armingTimeout'] = this.timeout;
        ret['lastSiren'] = (this.lastSiren == null) ? null : this.lastSiren.valueOf;
        ret['triggeredItems'] = this.triggeredItems;
        ret['wouldTriggerItems'] = this.wouldTriggerItems;
        ret['bypassedItems'] = this.bypassedItems;
        ret['metadata'] = this.metadata;
        return ret;
    };
    ArmedState.prototype._clear = function () {
        var _this = this;
        transaction(function () {
            _this.notifyChanged();
            _this.triggeredItems = {};
            _this.wouldTriggerItems = {};
            _this.bypassedItems = {};
            _this.lastSiren = null;
            _this.startTime = null;
        }, this);
    };
    ArmedState.prototype._deactivate = function () {
        this._clear();
    };
    ArmedState.prototype._activate = function () {
        var _this = this;
        var deferred = Q.defer();
        var self = this;
        transaction(function () {
            self.notifyChanged();
            self._clear();
            self.startTime = new Date(Date.now() + 1000 * _this.timeout);
            ArmedState.logEvent = null;
            self.updateLogEvent();
        });
        deferred.resolve(true);
        return deferred.promise;
    };
    ArmedState.prototype.isActive = function () {
        return service.Service.instance.armedStates.active == this;
    };
    ArmedState.prototype.activate = function () {
        return service.Service.instance.armedStates.activate(this);
    };
    ArmedState.prototype.bypass = function (item) {
        var _this = this;
        var self = this;
        transaction(function () {
            if (item instanceof Group) {
                var group = item;
                group.forEachItem(self.bypass, _this);
                return;
            }
            assert(_this.at(item.id) == item);
            if (!self.bypassedItems[item.id]) {
                _this.bypassedItems[item.id] = item;
                _this.notifyChanged();
            }
        });
    };
    ArmedState.prototype.updateLogEvent = function () {
        var deferred = Q.defer();
        var userName = domain_info.DomainInfo.active.user.name;
        var persist = false;
        if (_.isNull(ArmedState.logEvent)) {
            persist = true;
            ArmedState.logEvent = new event_log.Event({
                type: "arming",
                message: "armed",
                severity: 0 /* INFO */,
                user: userName,
                data: {}
            });
        }
        var curData = ArmedState.logEvent.data;
        var curDataStr = JSON.stringify(curData);
        var newData = this.toJson();
        if (newData['armingTimeLeft'] == 0 && !U.isNullOrUndefined(curData['wouldTriggerItems']))
            newData['wouldTriggerItems'] = curData['wouldTriggerItems'];
        delete newData['name'];
        delete newData['securityLevel'];
        delete newData['armingTimeout'];
        delete newData['armingTimeLeft'];
        delete newData['type'];
        delete newData['active'];
        delete newData['metadata'];
        if (U.isNullOrUndefined(newData['triggeredItems']) && Object.keys(newData['triggeredItems']).length > 0) {
            ArmedState.logEvent.severity = 3 /* ALERT */;
            newData['severity'] = 3 /* ALERT */;
        }
        else if (U.isNullOrUndefined(newData['wouldTriggerItems']) && Object.keys(newData['wouldTriggerItems']).length > 0) {
            ArmedState.logEvent.severity = 1 /* NOTICE */;
            newData['severity'] = 1 /* NOTICE */;
        }
        var newDataStr = JSON.stringify(newData);
        if (newDataStr !== curDataStr) {
            ArmedState.logEvent.data = newData;
            persist = true;
        }
        if (persist) {
            service.Service.instance.eventLog.log(ArmedState.logEvent).then(function () {
                deferred.resolve(true);
            });
        }
        else {
            deferred.resolve(true);
        }
        return deferred.promise;
    };
    ArmedState.logEvent = null;
    return ArmedState;
})(Group);
exports.ArmedState = ArmedState;
var ArmedStates = (function (_super) {
    __extends(ArmedStates, _super);
    function ArmedStates(o) {
        var _this = this;
        _super.call(this, _.clone(o, false, function (o) {
            o.id = 'ArmedStates';
        }));
        this._statesMap = {};
        this._statesArray = o.armedStates;
        var order = 0;
        _.forEach(o.armedStates, function (armedState) {
            _this._statesMap[armedState.id] = armedState;
            armedState.addParent(_this);
        }, this);
    }
    Object.defineProperty(ArmedStates.prototype, "active", {
        get: function () {
            return this._active;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ArmedStates.prototype, "prev", {
        get: function () {
            return this._prev;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ArmedStates.prototype, "states", {
        get: function () {
            return this._statesArray;
        },
        enumerable: true,
        configurable: true
    });
    ArmedStates.prototype.toJson = function () {
        var ret = _super.prototype.toJson.call(this);
        ret['type'] = 'ArmedStates';
        ret['active'] = (this.active == null) ? null : this.active.id;
        ret['states'] = this._statesArray.map(function (e) { return e.id; });
        return ret;
    };
    ArmedStates.prototype.activate = function (armedState) {
        var _this = this;
        var deferred = Q.defer();
        if (this.active == armedState) {
            deferred.resolve(true);
        }
        else {
            armedState._activate().then(function () {
                itemModule.transaction(function () {
                    _this._prev = _this.active;
                    if (_this.active != null)
                        _this.active._deactivate();
                    _this._active = armedState;
                    _this.notifyChanged();
                    _this.active.notifyChanged();
                    deferred.resolve(true);
                }, _this);
            });
        }
        return deferred.promise;
    };
    return ArmedStates;
})(Group);
exports.ArmedStates = ArmedStates;
//# sourceMappingURL=arming.js.map