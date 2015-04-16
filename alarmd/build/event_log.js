var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var assert = require('assert');
var _ = require('lodash');
var NeDB = require('nedb');
var Q = require('q');
var U = require('./u');
var itemModule = require('./item');
var di = require('./domain_info');
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
        this._id = null;
        this._type = o.type;
        this._message = o.message;
        this._severity = o.severity;
        this._user = U.isNullOrUndefined(o.user) ? di.service.users.getAdmin().name : o.user;
        this._time = o.time || new Date();
        this._data = o.data;
    }
    Event.getUniqueTime = function (time) {
        Event.lastSeq += 1;
        var seq = Event.lastSeq;
        var uniqueTime = Math.floor(time.getTime() / 1000) + (seq / 1000000.0);
        return uniqueTime;
    };
    Object.defineProperty(Event.prototype, "id", {
        get: function () {
            return this._id;
        },
        set: function (id) {
            assert(U.isNullOrUndefined(this._id));
            this._id = id;
        },
        enumerable: true,
        configurable: true
    });
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
            '_id': this._id,
            'type': this._type,
            'message': this._message,
            'time': Math.floor(this._time.valueOf() / 1000),
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
    function EventLog(filename, eventLogKeepDays) {
        _super.call(this, {
            id: "EventLog"
        });
        this.modified = 0;
        this.database = new NeDB(filename);
        this.keepDays = eventLogKeepDays;
    }
    EventLog.prototype.toJson = function () {
        var ret = _super.prototype.toJson.call(this);
        ret['type'] = 'EventLog';
        ret['modified'] = this.modified;
        return ret;
    };
    EventLog.prototype.doCleanup = function () {
        var deferred = Q.defer();
        var maxTime = (new Date().valueOf() / 1000) - this.keepDays * 24 * 60 * 60;
        var query = {
            time: { $lt: maxTime }
        };
        this.database.remove(query, { multi: true }, function (err, numRemoved) {
            if (err) {
                logger.error("cleanup failed. err:", err);
                deferred.reject(err);
            }
            else {
                logger.info("cleanup completed. removed %d records:", numRemoved);
                deferred.resolve(true);
            }
        });
        return deferred.promise;
    };
    EventLog.prototype.rescheduleCleanup = function () {
        var deferred = Q.defer();
        var self = this;
        Q.delay(24 * 60 * 60 * 1000).then(function () {
            self.rescheduleCleanup(); // for next time
            self.doCleanup();
        });
    };
    EventLog.prototype.start = function () {
        var deferred = Q.defer();
        var self = this;
        self.database.loadDatabase(function (err) {
            if (err) {
                logger.error("failed to create/open event_log database. error:", err);
                deferred.reject(err);
            }
            else {
                self.database.persistence.setAutocompactionInterval(24 * 60 * 60 * 1000);
                self.doCleanup().then(function (result) {
                    self.rescheduleCleanup();
                    deferred.resolve(true);
                }, function (err) {
                    deferred.reject(err);
                });
            }
        });
        return deferred.promise;
    };
    EventLog.prototype.log = function (event) {
        var deferred = Q.defer();
        var self = this;
        var id = event.id;
        if (U.isNullOrUndefined(event.id)) {
            event.id = Event.getUniqueTime(event.time).toString();
            var doc = event.toJson();
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
        }
        else {
            var doc = event.toJson();
            self.database.update({ _id: event.id }, doc, {}, function (err, numReplaced, upsert) {
                if (err) {
                    logger.error("failed to update event_log record to database. error:", err);
                    deferred.reject(false);
                }
                else {
                    itemModule.transaction(function () {
                        self.modified += 1;
                    });
                    deferred.resolve(true);
                }
            });
        }
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
                        time: new Date(doc.time * 1000),
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