"use strict";
var _ = require('lodash');
var NeDB = require('nedb');
var Q = require('q');
var U = require('./u');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var ItemHistory = (function () {
    function ItemHistory() {
        this.history = {};
    }
    return ItemHistory;
}());
exports.ItemHistory = ItemHistory;
var SensorHistory = (function () {
    function SensorHistory(filename, sensorHistoryKeepDays) {
        this.history = {};
        this.database = new NeDB(filename);
        this.keepDays = sensorHistoryKeepDays;
    }
    SensorHistory.prototype.persist = function () {
        var _this = this;
        var sql = "insert into sensor_history (sensorId, eventTime, detectCount) values (?, ?, ?)";
        var now = new Date();
        var currentSlot = Math.floor(now.getTime() / 1000 / 300) * 300;
        var self = this;
        // clone keys to avoid iteration while modifying
        var items = _.clone(Object.keys(this.history));
        _.forEach(items, function (id) {
            var itemHistory = _this.history[id];
            if (itemHistory) {
                // clone keys to avoid iteration while modifying
                var slots = _.clone(Object.keys(itemHistory.history));
                _.forEach(slots, function (slot) {
                    if (parseInt(slot) !== currentSlot) {
                        var count = itemHistory.history[slot];
                        if (!_.isUndefined(count) && count > 0) {
                            var doc = {
                                id: id,
                                time: slot,
                                count: count
                            };
                            _this.database.insert(doc, function (err) {
                                if (itemHistory.history[slot]) {
                                    itemHistory.history[slot] -= count;
                                    if (itemHistory.history[slot] == 0) {
                                        delete itemHistory.history[slot];
                                        var tmp = _this.history[id];
                                        if (Object.keys(tmp.history).length == 0)
                                            delete _this.history[id];
                                    }
                                }
                                if (err) {
                                    logger.error("failed to insert record into sensor_history database. error:", err);
                                }
                            });
                        }
                    }
                }, self);
            }
        }, self);
    };
    SensorHistory.prototype.reschedulePersist = function () {
        var deferred = Q.defer();
        var self = this;
        Q.delay(5 * 60 * 1000)
            .then(function () {
            self.reschedulePersist(); // for next time
            self.persist();
        });
    };
    SensorHistory.prototype.doCleanup = function () {
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
    SensorHistory.prototype.rescheduleCleanup = function () {
        var deferred = Q.defer();
        var self = this;
        Q.delay(24 * 60 * 60 * 1000)
            .then(function () {
            self.rescheduleCleanup(); // for next time
            self.doCleanup();
        });
    };
    SensorHistory.prototype.start = function () {
        var deferred = Q.defer();
        var self = this;
        self.database.loadDatabase(function (err) {
            if (err) {
                logger.error("failed to create/open sensor_history database. error:", err);
                deferred.reject(err);
            }
            else {
                self.database.persistence.setAutocompactionInterval(24 * 60 * 60 * 1000);
                self.doCleanup()
                    .then(function (result) {
                    self.rescheduleCleanup();
                    self.reschedulePersist();
                    deferred.resolve(true);
                }, function (err) {
                    deferred.reject(err);
                });
            }
        });
        return deferred.promise;
    };
    SensorHistory.prototype.add = function (slot, id) {
        var itemHistory = this.history[id];
        if (!itemHistory) {
            itemHistory = new ItemHistory();
            this.history[id] = itemHistory;
        }
        if (!itemHistory.history[slot])
            itemHistory.history[slot] = 1;
        else
            itemHistory.history[slot] += 1;
    };
    SensorHistory.prototype.query = function (id) {
        var _this = this;
        var deferred = Q.defer();
        var self = this;
        var itemHistory = new ItemHistory();
        self.database.find({ id: id }, function (err, docs) {
            if (err) {
                logger.error("failed to retrieve record from sensor_history. error:", err);
                deferred.reject("failed");
            }
            else {
                _.forEach(docs, function (doc) {
                    itemHistory.history[doc.time] = doc.count;
                });
                var pendingUpdates = _this.history[id];
                if (!U.isNullOrUndefined(pendingUpdates)) {
                    _.forEach(pendingUpdates.history, function (v, k) {
                        itemHistory.history[k] = v;
                    });
                }
                deferred.resolve(itemHistory);
            }
        });
        return deferred.promise;
    };
    return SensorHistory;
}());
exports.SensorHistory = SensorHistory;
//# sourceMappingURL=sensor_history.js.map