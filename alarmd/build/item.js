var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
///<reference path="externals.d.ts"/>
var util = require('util');
var eventsModule = require('events');
var assert = require('assert');
var through = require('through');
var _ = require('lodash');
var U = require('./u');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var EventEmitter = eventsModule.EventEmitter;
var SyncPoint = (function () {
    function SyncPoint() {
        this._value = SyncPoint._currentValue;
    }
    Object.defineProperty(SyncPoint.prototype, "value", {
        get: function () {
            return this._value;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SyncPoint, "zero", {
        get: function () {
            return SyncPoint._zero;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(SyncPoint, "currentValue", {
        get: function () {
            return SyncPoint._currentValue;
        },
        enumerable: true,
        configurable: true
    });
    SyncPoint.fromValue = function (value) {
        var syncPoint = new SyncPoint();
        syncPoint.value = value;
        return syncPoint;
    };
    SyncPoint.inc = function () {
        return SyncPoint.fromValue(++SyncPoint._currentValue);
    };
    SyncPoint.prototype.sub = function (other) {
        return this.value - other.value;
    };
    SyncPoint.prototype.compareTo = function (other) {
        return this.value - other.value;
    };
    SyncPoint.prototype.format = function () {
        return util.format("%d.%d", SyncPoint._startTime, this.value);
    };
    SyncPoint.parse = function (sinceString) {
        if (U.isNullOrUndefined(sinceString))
            return null;
        var sinceParts = sinceString.split('\.');
        if (sinceParts == null || sinceParts.length != 2) {
            throw new Error("invalid since format");
        }
        var startTime = parseInt(sinceParts[0]);
        if (startTime != SyncPoint._startTime)
            return null;
        return SyncPoint.fromValue(parseInt(sinceParts[1]));
    };
    SyncPoint._startTime = Date.now();
    SyncPoint._currentValue = 0;
    SyncPoint._zero = SyncPoint.fromValue(0);
    return SyncPoint;
})();
exports.SyncPoint = SyncPoint;
var ItemEvent = (function () {
    function ItemEvent(item, syncPoint, json, originator) {
        this._item = item;
        this._syncPoint = syncPoint;
        this._json = json;
        this._originator = !U.isNullOrUndefined(originator) ? originator : null;
    }
    Object.defineProperty(ItemEvent.prototype, "item", {
        get: function () {
            return this._item;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ItemEvent.prototype, "syncPoint", {
        get: function () {
            return this._syncPoint;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ItemEvent.prototype, "json", {
        get: function () {
            return this._json;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ItemEvent.prototype, "originator", {
        get: function () {
            return this._originator;
        },
        enumerable: true,
        configurable: true
    });
    ItemEvent.prototype.source = function () {
        var s = this;
        while (s.originator != null)
            s = s.originator;
        return s;
    };
    ItemEvent.prototype.toString = function () {
        return util.format("item:%s, sp:%d", this.item.id, this.syncPoint.value);
    };
    return ItemEvent;
})();
exports.ItemEvent = ItemEvent;
var ItemTransaction = (function () {
    function ItemTransaction(item, originator) {
        this.item = item;
        this.originator = originator;
    }
    return ItemTransaction;
})();
var _GlobalTransaction = (function () {
    function _GlobalTransaction() {
        this.notify = {};
        this.startedTransactions = 0;
        this.completedTransactions = 0;
    }
    _GlobalTransaction.prototype.insideTransaction = function () {
        return this.startedTransactions > 0;
    };
    _GlobalTransaction.prototype.start = function () {
        assert(this.startedTransactions == 0 || this.startedTransactions > this.completedTransactions);
        ++this.startedTransactions;
    };
    _GlobalTransaction.prototype.notifyChanged = function (item, originator) {
        if (this.startedTransactions === this.completedTransactions)
            return false;
        if (!this.notify[item.id])
            this.notify[item.id] = new ItemTransaction(item, originator);
        return true;
    };
    _GlobalTransaction.prototype.end = function () {
        if (++this.completedTransactions !== this.startedTransactions)
            return;
        var saveCompleted = this.completedTransactions;
        try {
            while (true) {
                var itemTransactions = _.values(this.notify);
                if (itemTransactions.length == 0)
                    return;
                //if (itemTransactions.length > 1) {
                //  logger.info("Check sort");
                //}
                this.notify = {};
                _.forEach(itemTransactions, function (itemTransaction) {
                    try {
                        itemTransaction.item.notifyChanged(itemTransaction.originator);
                    }
                    catch (e) {
                        logger.error(util.format("error during transaction notify change. error: %s. stack:%s", e.toString(), e.stack));
                    }
                });
            }
        }
        finally {
            this.completedTransactions -= saveCompleted;
            this.startedTransactions -= saveCompleted;
        }
    };
    _GlobalTransaction.current = new _GlobalTransaction();
    return _GlobalTransaction;
})();
function transaction(t, thisArg) {
    var cb = _.bind(t, thisArg);
    _GlobalTransaction.current.start();
    try {
        cb();
    }
    finally {
        _GlobalTransaction.current.end();
    }
}
exports.transaction = transaction;
var Item = (function (_super) {
    __extends(Item, _super);
    function Item(o) {
        _super.call(this);
        this._syncPoint = new SyncPoint();
        this._parentGroups = [];
        this._eventInProgress = false;
        this._syncPointNotifyChanged = SyncPoint.zero;
        this._id = o.id;
        this._name = !U.isNullOrUndefined(o.name) ? o.name : o.id;
        this._disabled = !U.isNullOrUndefined(o.disabled) ? o.disabled === true : false;
        this._minor = !U.isNullOrUndefined(o.minor) ? o.minor === true : false;
        this.metadata = o.metadata || null;
        ItemEvents.instance.addItem(this);
        if (o.groups) {
            for (var i in o.groups) {
                var g = o.groups[i];
                this.addParent(g);
            }
        }
    }
    Object.defineProperty(Item.prototype, "id", {
        get: function () {
            return this._id;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Item.prototype, "name", {
        get: function () {
            return this._name;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Item.prototype, "minor", {
        get: function () {
            return this._minor;
        },
        enumerable: true,
        configurable: true
    });
    Item.prototype.addParent = function (g) {
        assert(this._parentGroups.indexOf(g) == -1);
        this._parentGroups.push(g);
        g.add(this);
    };
    Item.prototype.forEachParentGroup = function (cb, thisArg) {
        if (this._parentGroups != null) {
            _.forEach(this._parentGroups, cb, thisArg);
        }
    };
    Object.defineProperty(Item.prototype, "syncPoint", {
        get: function () {
            return this._syncPoint;
        },
        enumerable: true,
        configurable: true
    });
    Item.prototype.newEvent = function (originator) {
        var itemEvent = new ItemEvent(this, this._syncPoint, this.toJson(), originator);
        return itemEvent;
    };
    Item.prototype.setNotify = function (item, oldValue, newValue) {
        if (oldValue == newValue)
            return oldValue;
        item.notifyChanged();
        return newValue;
    };
    Item.prototype.onItemChanged = function (event) {
        logger.debug(util.format("item change event. item:%s: from:%s", this.id, event.item.id));
    };
    Item.prototype.subscribe = function (toItem) {
        var self = this;
        toItem.on("event", function (e) {
            self.onItemChanged(e);
        });
    };
    Item.prototype._notifyChangeParents = function (event) {
        this.forEachParentGroup(function (group) { return group.notifyChanged(event); });
    };
    Item.prototype.notifyChanged = function (originator) {
        U.assertDebugger(_GlobalTransaction.current.insideTransaction());
        if (this._syncPointNotifyChanged > this._syncPoint)
            return;
        if (_GlobalTransaction.current.notifyChanged(this, originator))
            return;
        this._syncPointNotifyChanged = this._syncPoint;
        this._syncPoint = SyncPoint.inc();
        var event = this.newEvent(originator);
        //ensure that we are still the latest
        assert(this._syncPoint.value === SyncPoint.currentValue);
        ItemEvents.instance.handleEvent(event);
        this.emit("event", event);
        this._notifyChangeParents(event);
    };
    Item.prototype.isChanged = function (from, to) {
        if (from != null && from.value > this._syncPoint.value)
            return false;
        if (to != null && to.value < this._syncPoint.value)
            return false;
        return true;
    };
    Item.prototype.toJson = function () {
        var ret = {
            'type': 'Item',
            'id': this.id,
            'name': this._name,
            'metadata': this.metadata,
            'disabled': this._disabled,
            'syncValue': this.syncPoint.format()
        };
        return ret;
    };
    return Item;
})(EventEmitter);
exports.Item = Item;
var Nop = (function (_super) {
    __extends(Nop, _super);
    function Nop() {
        _super.call(this, { id: 'NOP', name: 'NOP' });
    }
    Object.defineProperty(Nop, "instance", {
        get: function () {
            if (Nop._instance == null) {
                Nop._instance = new Nop();
            }
            return Nop._instance;
        },
        enumerable: true,
        configurable: true
    });
    Nop.prototype.toJson = function () {
        var ret = _super.prototype.toJson.call(this);
        ret['type'] = 'NOP';
        ret['syncValue'] = new SyncPoint().format();
        return ret;
    };
    Nop._instance = null;
    return Nop;
})(Item);
exports.Nop = Nop;
var Group = (function (_super) {
    __extends(Group, _super);
    function Group(o) {
        _super.call(this, _.clone(o, false, function (o) {
            o.minor = true;
        }));
        this._childItems = {};
        this._childGroups = {};
        this._allItems = {};
    }
    Object.defineProperty(Group.prototype, "allItems", {
        get: function () {
            return this._allItems;
        },
        enumerable: true,
        configurable: true
    });
    Group.prototype.at = function (id) {
        return this._allItems[id];
    };
    Group.prototype.forEachChildItem = function (cb, thisArg) {
        if (this._childItems != null) {
            _.forEach(this._childItems, cb, thisArg);
        }
    };
    Group.prototype.forEachChildGroup = function (cb, thisArg) {
        if (this._childGroups != null) {
            _.forEach(this._childGroups, cb, thisArg);
        }
    };
    Group.prototype.forEachItem = function (cb, thisArg) {
        if (this._allItems != null) {
            _.forEach(this._allItems, cb, thisArg);
        }
    };
    Group.prototype._addItem = function (item) {
        var _this = this;
        assert(item != this);
        var i = this._allItems[item.id];
        assert(_.isUndefined(i) || i == item);
        if (i == item)
            return;
        this._allItems[item.id] = item;
        if (item instanceof Group) {
            item.forEachItem(function (groupItem) {
                _this._addItem(groupItem);
            }, this);
        }
        this.forEachParentGroup(function (group) {
            group.itemAdded(_this, item);
        }, this);
    };
    Group.prototype.containsChild = function (item) {
        if (this._childItems[item.id])
            return true;
        return false;
    };
    Group.prototype.containsItem = function (item) {
        if (this._allItems[item.id])
            return true;
        return false;
    };
    Group.prototype.itemAdded = function (childGroup, item) {
        this._addItem(item);
    };
    Group.prototype.add = function (item) {
        assert(!this._childItems[item.id]);
        this._childItems[item.id] = item;
        if (item instanceof Group)
            this._childGroups[item.id] = item;
        this._addItem(item);
        this.subscribe(item);
        this.notifyChanged();
    };
    Group.prototype.toJson = function () {
        var ret = _super.prototype.toJson.call(this);
        ret['type'] = 'Group';
        ret['detected'] = _.filter(this._allItems, function (e) { return e instanceof Sensor && e.isDetected(); }).map(function (e) { return e.id; });
        return ret;
    };
    return Group;
})(Item);
exports.Group = Group;
var Sensor = (function (_super) {
    __extends(Sensor, _super);
    function Sensor(o) {
        _super.call(this, o);
        this._gpioId = o.gpioId;
    }
    Object.defineProperty(Sensor.prototype, "gpioId", {
        get: function () {
            return this._gpioId;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Sensor.prototype, "state", {
        get: function () {
            return this._state;
        },
        set: function (state) {
            if (this._state === state)
                return;
            this._state = state;
            this.notifyChanged();
        },
        enumerable: true,
        configurable: true
    });
    Sensor.prototype.formatState = function () {
        throw new Error("not implemented");
    };
    Sensor.prototype.isDetected = function () {
        throw new Error("not implemented");
    };
    Sensor.prototype.toJson = function () {
        var ret = _super.prototype.toJson.call(this);
        ret['type'] = 'Sensor';
        ret['state'] = this.formatState();
        ret['detected'] = this.isDetected();
        return ret;
    };
    return Sensor;
})(Item);
exports.Sensor = Sensor;
var BooleanSensor = (function (_super) {
    __extends(BooleanSensor, _super);
    function BooleanSensor(o) {
        _super.call(this, o);
        this.state = false;
    }
    BooleanSensor.prototype.formatState = function () {
        return this.state.toString();
    };
    BooleanSensor.prototype.isDetected = function () {
        return this.state === true;
    };
    return BooleanSensor;
})(Sensor);
exports.BooleanSensor = BooleanSensor;
var NumericSensor = (function (_super) {
    __extends(NumericSensor, _super);
    function NumericSensor(o) {
        _super.call(this, o);
        this.state = 0;
    }
    NumericSensor.prototype.formatState = function () {
        return this.state.toString();
    };
    NumericSensor.prototype.isDetected = function () {
        if (this.state == null)
            return false;
        var i = this.state;
        return i > 0;
    };
    return NumericSensor;
})(Sensor);
exports.NumericSensor = NumericSensor;
var ArduinoSensor = (function (_super) {
    __extends(ArduinoSensor, _super);
    function ArduinoSensor(o) {
        _super.call(this, o);
    }
    return ArduinoSensor;
})(NumericSensor);
exports.ArduinoSensor = ArduinoSensor;
var ArduinoInputPullupSensor = (function (_super) {
    __extends(ArduinoInputPullupSensor, _super);
    function ArduinoInputPullupSensor(o) {
        _super.call(this, o);
    }
    ArduinoInputPullupSensor.prototype.isDetected = function () {
        if (this.state == null)
            return false;
        if (this.state.toString() == '1') {
            return true;
        }
        return false;
    };
    ArduinoInputPullupSensor.prototype.formatState = function () {
        return this.isDetected() ? "ON" : "OFF";
    };
    return ArduinoInputPullupSensor;
})(ArduinoSensor);
exports.ArduinoInputPullupSensor = ArduinoInputPullupSensor;
var ArduinoInputAnalogSensor = (function (_super) {
    __extends(ArduinoInputAnalogSensor, _super);
    function ArduinoInputAnalogSensor(o) {
        _super.call(this, o);
    }
    ArduinoInputAnalogSensor.prototype.isDetected = function () {
        var value = parseInt(this.formatState());
        if (this.state == null && value > 400) {
            return false;
        }
        return true;
    };
    ArduinoInputAnalogSensor.prototype.formatState = function () {
        return this.isDetected() ? "ON" : "OFF";
    };
    return ArduinoInputAnalogSensor;
})(ArduinoSensor);
exports.ArduinoInputAnalogSensor = ArduinoInputAnalogSensor;
var Siren = (function (_super) {
    __extends(Siren, _super);
    function Siren(o) {
        _super.call(this, o);
        this._active = false;
        this._lastActive = null;
        this._timeLeftToNextState = 0;
        this._nextStateTime = null;
        this._maxActiveTime = !U.isNullOrUndefined(o.maxActiveTime) ? o.maxActiveTime : 10 * 60;
        this.mqttClient = o.mqttClient;
        this._topic = o.topic;
        this._activateCommand = o.activateCommand;
        this._deactivateCommand = o.deactivateCommand;
    }
    Siren.prototype.isActive = function () {
        return this._active;
    };
    Object.defineProperty(Siren.prototype, "timeLeftToNextState", {
        get: function () {
            if (this._nextStateTime == null)
                return 0;
            var left = Math.floor((this._nextStateTime.valueOf() - Date.now()) / 1000);
            return (left < 0) ? 0 : left;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Siren.prototype, "nextStateTime", {
        get: function () {
            return this._nextStateTime;
        },
        enumerable: true,
        configurable: true
    });
    Siren.prototype._checkNotifyChangedTimeLeft = function () {
        var _this = this;
        if (this.timeLeftToNextState > 0) {
            setTimeout(function () {
                transaction(function () {
                    _this.notifyChanged();
                }, _this);
                _this._checkNotifyChangedTimeLeft();
            }, 500);
        }
    };
    Object.defineProperty(Siren.prototype, "active", {
        get: function () {
            return this._active;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Siren.prototype, "lastActive", {
        get: function () {
            return this._lastActive;
        },
        enumerable: true,
        configurable: true
    });
    Siren.prototype.toJson = function () {
        var ret = _super.prototype.toJson.call(this);
        ret['type'] = 'Siren';
        ret['active'] = this.active;
        ret['lastActive'] = (this.lastActive == null) ? null : Math.floor(this.lastActive.valueOf() / 1000);
        ret['timeLeft'] = this.timeLeftToNextState;
        ret['nextStateTime'] = (this._nextStateTime == null) ? null : Math.floor(this._nextStateTime.valueOf() / 1000);
        return ret;
    };
    Siren.prototype._setActive = function (active, newTimeLeftToNextState) {
        var _this = this;
        if (this._active == active && this._timeLeftToNextState == newTimeLeftToNextState)
            return;
        transaction(function () {
            logger.debug("siren._setActive(active:%s, timeLeftToNextState: %s)", active, newTimeLeftToNextState);
            var now = new Date();
            if (!_this._active && active)
                _this._lastActive = now;
            _this._timeLeftToNextState = newTimeLeftToNextState;
            if (_this._active != active && !U.isNullOrUndefined(_this.mqttClient) && !U.isNullOrUndefined(_this._topic) && _this._topic.length > 0) {
                if (active) {
                    if (!U.isNullOrUndefined(_this._activateCommand) && _this._activateCommand.length > 0) {
                        _this.mqttClient.publish(_this._topic, _this._activateCommand);
                    }
                }
                else if (!U.isNullOrUndefined(_this._deactivateCommand) && _this._deactivateCommand.length > 0) {
                    _this.mqttClient.publish(_this._topic, _this._deactivateCommand);
                }
            }
            _this._active = active;
            if (_this._timeLeftToNextState == 0)
                _this._nextStateTime = null;
            else
                _this._nextStateTime = new Date(Date.now() + 1000 * _this._timeLeftToNextState);
            _this._checkNotifyChangedTimeLeft();
            _this.notifyChanged();
        }, this);
    };
    Siren.prototype.deactivate = function () {
        this._setActive(false, 0);
    };
    Siren.prototype.activate = function () {
        this._setActive(true, this._maxActiveTime);
    };
    Siren.prototype.scheduleActivate = function (newTimeLeftToNextState) {
        if (this._active)
            return;
        this._setActive(false, newTimeLeftToNextState);
    };
    return Siren;
})(Item);
exports.Siren = Siren;
var ItemEvents = (function () {
    function ItemEvents() {
        this.ring = [];
        this._lastReceived = SyncPoint.zero;
        this._items = {};
        //private _items:Item[];
        this.ringSize = 1000;
        this.activeStreams = [];
    }
    Object.defineProperty(ItemEvents, "instance", {
        get: function () {
            return ItemEvents._instance;
        },
        enumerable: true,
        configurable: true
    });
    ItemEvents.prototype.addItem = function (item) {
        this._items[item.id] = item;
    };
    ItemEvents.prototype.findEvent = function (syncPoint) {
        var minIndex = 0;
        var maxIndex = this.ring.length - 1;
        var currentIndex;
        var currentElement;
        while (minIndex <= maxIndex) {
            currentIndex = (minIndex + maxIndex) / 2 | 0;
            currentElement = this.ring[currentIndex];
            var cmp = currentElement.syncPoint.compareTo(syncPoint);
            if (cmp < 0) {
                minIndex = currentIndex + 1;
            }
            else if (cmp > 0) {
                maxIndex = currentIndex - 1;
            }
            else {
                return currentIndex;
            }
        }
        return -1;
    };
    ItemEvents.prototype.handleEvent = function (event) {
        assert(event != null);
        // we ignore duplicate events
        if (this.findEvent(event.syncPoint) >= 0)
            return;
        // to ensure we handle events in order, we recurse first
        if (event.originator != null)
            this.handleEvent(event.originator);
        logger.debug("checking event. ", event.item.id);
        U.assertDebugger(this._lastReceived.value == 0 || this._lastReceived.value + 1 == event.syncPoint.value);
        logger.debug(util.format("handling event. %s", event.toString()));
        this._lastReceived = event.syncPoint;
        this.ring.push(event);
        while (this.ring.length > this.ringSize)
            this.ring.shift();
        _.forEach(this.activeStreams, function (e) {
            e.push(event);
        });
    };
    ItemEvents.prototype.snapshotEvents = function () {
        var collected = {};
        _.forEach(this._items, function (item) {
            collected[item.id] = item.newEvent();
            if (item instanceof Group) {
                var group = item;
                group.forEachItem(function (item) {
                    collected[item.id] = item.newEvent();
                });
            }
        });
        var events = _.values(collected);
        events.sort(function (a, b) {
            return a.syncPoint.compareTo(b.syncPoint);
        });
        return events;
    };
    ItemEvents.prototype.stream = function (since) {
        var _this = this;
        var strm = through();
        strm.pause();
        strm.on('end', function () {
            _this.activeStreams.filter(function (e) {
                return (e != strm);
            });
        });
        var sincePos = (since == null) ? -1 : this.findEvent(since);
        if (sincePos == -1) {
            var snapshot = this.snapshotEvents();
            _.forEach(snapshot, function (e) {
                strm.push(e);
            });
        }
        else {
            for (var i = sincePos + 1; i < this.ring.length; ++i) {
                var itemEvent = this.ring[i];
                strm.push(itemEvent);
            }
        }
        this.activeStreams.push(strm);
        return strm;
    };
    ItemEvents._instance = new ItemEvents();
    return ItemEvents;
})();
exports.ItemEvents = ItemEvents;
//# sourceMappingURL=item.js.map