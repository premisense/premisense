var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var _ = require('lodash');
var NeDB = require('nedb');
var Q = require('q');
var U = require('./u');
var itemModule = require('./item');
var serviceModule = require('./service');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
(function (Severity) {
    Severity[Severity["INFO"] = 0] = "INFO";
    Severity[Severity["NOTICE"] = 1] = "NOTICE";
    Severity[Severity["WARNING"] = 2] = "WARNING";
    Severity[Severity["ALERT"] = 3] = "ALERT";
})(exports.Severity || (exports.Severity = {}));
var Severity = exports.Severity;
var Event = (function () {
    function Event(o) {
        this._type = o.type;
        this._message = o.message;
        this._severity = o.severity;
        this._user = U.isNullOrUndefined(o.user) ? serviceModule.Service.instance.users.getAdmin().name : o.user;
        this._time = o.time || new Date();
        this._data = o.data;
    }
    Event.getUniqueTime = function (time) {
        Event.lastSeq += 1;
        var seq = Event.lastSeq;
        var uniqueTime = Math.floor(time.getTime() / 1000) + (seq / 1000000.0);
        return uniqueTime;
    };
    Object.defineProperty(Event.prototype, "type", {
        get: function () {
            return this._type;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Event.prototype, "message", {
        get: function () {
            return this._message;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Event.prototype, "user", {
        get: function () {
            return this._user;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Event.prototype, "time", {
        get: function () {
            return this._time;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Event.prototype, "data", {
        get: function () {
            return this._data;
        },
        set: function (d) {
            this._data = d;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Event.prototype, "severity", {
        get: function () {
            return this._severity;
        },
        set: function (s) {
            this._severity = s;
        },
        enumerable: true,
        configurable: true
    });
    Event.prototype.toJson = function () {
        var ret = {
            'type': this._type,
            'message': this._message,
            'time': this._time,
            'severity': this._severity,
            'data': this._data,
            'user': this._user
        };
        return ret;
    };
    Event.lastSeq = 0;
    return Event;
})();
exports.Event = Event;
var EventLog = (function (_super) {
    __extends(EventLog, _super);
    function EventLog(filename) {
        _super.call(this, {
            id: "EventLog"
        });
        this.modified = 0;
        this.database = new NeDB(filename);
    }
    EventLog.prototype.toJson = function () {
        var ret = _super.prototype.toJson.call(this);
        ret['type'] = 'EventLog';
        ret['modified'] = this.modified;
        return ret;
    };
    EventLog.prototype.start = function () {
        var deferred = Q.defer();
        var self = this;
        self.database.loadDatabase(function (err) {
            if (err) {
                logger.error("failed to create/open event_log database. error:", err);
                deferred.resolve(false);
            }
            else {
                self.database.persistence.setAutocompactionInterval(24 * 60 * 60 * 1000);
                deferred.resolve(true);
            }
        });
        return deferred.promise;
    };
    EventLog.prototype.log = function (event) {
        var deferred = Q.defer();
        var self = this;
        var doc = {
            time: Event.getUniqueTime(event.time),
            type: event.type,
            message: event.message,
            severity: event.severity,
            user: event.user,
            data: event.data
        };
        self.database.insert(doc, function (err) {
            if (err) {
                logger.error("failed to insert event_log record to database. error:", err);
                deferred.reject(false);
            }
            else {
                itemModule.transaction(function () {
                    self.modified += 1;
                });
                deferred.resolve(true);
            }
        });
        return deferred.promise;
    };
    EventLog.prototype.query = function () {
        var deferred = Q.defer();
        var self = this;
        var events = [];
        self.database.find({}, function (err, docs) {
            if (err) {
                logger.error("failed to retrieve record from event_log. error:", err);
            }
            else {
                _.forEach(docs, function (doc) {
                    var event = new Event({
                        type: doc.type,
                        message: doc.message,
                        severity: doc.severity,
                        user: doc.user,
                        time: doc.time,
                        data: doc.data
                    });
                    events.push(event);
                });
            }
            deferred.resolve(events);
        });
        return deferred.promise;
    };
    return EventLog;
})(itemModule.Item);
exports.EventLog = EventLog;
//# sourceMappingURL=event_log.js.map