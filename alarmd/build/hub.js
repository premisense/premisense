var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
///<reference path="externals.d.ts"/>
var util = require('util');
var assert = require('assert');
var Q = require('q');
var _ = require('lodash');
var itemModule = require('./item');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var Sensor = itemModule.Sensor;
var Hub = (function () {
    function Hub(o) {
        this._id = o.id;
    }
    Object.defineProperty(Hub.prototype, "id", {
        get: function () {
            return this._id;
        },
        enumerable: true,
        configurable: true
    });
    Hub.prototype.start = function () {
        throw "not implemented";
    };
    return Hub;
})();
exports.Hub = Hub;
var MqttHubDevice = (function () {
    function MqttHubDevice(o) {
        var _this = this;
        this._sensors = {};
        this._items = {};
        this.id = o.id;
        _.forEach(o.sensors, function (sensor) {
            assert(_.isUndefined(_this._sensors[sensor.gpioId]));
            assert(_.isUndefined(_this._items[sensor.id]));
            _this._sensors[sensor.gpioId] = sensor;
            _this._items[sensor.id] = sensor;
        });
    }
    MqttHubDevice.prototype.processMessage = function (topicParts, payload) {
        var gpioId = parseInt(topicParts[topicParts.length - 1]);
        var item = this._sensors[gpioId];
        assert(item == null || item instanceof Sensor);
        if (item != null && item instanceof Sensor) {
            var sensor = item;
            itemModule.transaction(function () {
                sensor.state = payload;
            });
        }
    };
    return MqttHubDevice;
})();
exports.MqttHubDevice = MqttHubDevice;
var MqttHub = (function (_super) {
    __extends(MqttHub, _super);
    function MqttHub(o) {
        _super.call(this, o);
        this.mqttClient = o.client;
        this.topicRoot = o.topicRoot;
        this.devices = o.devices;
        if (this.topicRoot[this.topicRoot.length - 1] !== '/')
            this.topicRoot += '/';
    }
    MqttHub.prototype.processMessage = function (topicParts, payload) {
        _.forEach(this.devices, function (device) {
            if (device.id === topicParts[0]) {
                device.processMessage(topicParts, payload);
            }
        }, this);
    };
    MqttHub.prototype.start = function () {
        var _this = this;
        var deferred = Q.defer();
        logger.debug("MqttHub(%s): starting", this.id);
        var self = this;
        var topic = util.format("%s+/state/+", this.topicRoot);
        logger.debug("MqttHub(%s): subscribing to topic: %s", this.id, topic);
        this.mqttClient.subscribe(topic, { qos: 2 });
        // re-subscribe to our topic
        this.mqttClient.on('connect', function () {
            self.mqttClient.subscribe(topic, { qos: 2 });
        });
        this.mqttClient.on('message', function (topic, payload) {
            if (topic.substr(0, self.topicRoot.length) === self.topicRoot) {
                logger.debug("MqttHub(%s): received message. topic:%s, payload:%s", _this.id, topic, payload);
                var relativeTopic = topic.substr(self.topicRoot.length);
                var topicParts = relativeTopic.split('/');
                self.processMessage(topicParts, payload.toString());
            }
        });
        deferred.resolve(true);
        return deferred.promise;
    };
    return MqttHub;
})(Hub);
exports.MqttHub = MqttHub;
//# sourceMappingURL=hub.js.map