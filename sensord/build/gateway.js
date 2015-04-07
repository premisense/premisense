var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
///<reference path="externals.d.ts"/>
var util = require('util');
var Q = require('q');
var child_process = require("child_process");
var fs = require('fs');
var split = require('split');
var _ = require('lodash');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var Gateway = (function () {
    function Gateway() {
    }
    Gateway.prototype.start = function () {
        throw "not implemented";
    };
    return Gateway;
})();
exports.Gateway = Gateway;
var ArduinoDevice = (function () {
    function ArduinoDevice(id, initString) {
        this.id = id;
        this.initString = initString;
    }
    return ArduinoDevice;
})();
exports.ArduinoDevice = ArduinoDevice;
var ArduinoSerialGateway = (function (_super) {
    __extends(ArduinoSerialGateway, _super);
    function ArduinoSerialGateway(mqttClient, topic, id, devices, port, initString, remoteSSH) {
        _super.call(this);
        this.initStringSent = false;
        this.child = null;
        this.id = id;
        this.devices = devices;
        this.initString = initString;
        this.mqttClient = mqttClient;
        this.topic = topic;
        this.commandTopic = util.format("%s/command/%s", this.topic, this.id);
        this.port = port;
        this.remoteSSH = remoteSSH;
    }
    ArduinoSerialGateway.prototype.writeString = function (s) {
        if (this.child == null) {
            logger.error(util.format("rejecting command: %s. not connected to device", s));
        }
        else {
            logger.debug(util.format("sending command: %s. to interface: %s", s, this.id));
            this.child.stdin.write("\n" + s + "\n");
        }
    };
    ArduinoSerialGateway.prototype.sendInitString = function (child) {
        var _this = this;
        logger.debug(util.format("serial(%s): not_configured. (re)sending init string (%s)...", this.id, this.initString));
        if (this.initString.length > 0) {
            child.stdin.write(this.initString + "\n");
        }
        _.forEach(this.devices, function (device) {
            if (device.initString.length > 0) {
                logger.debug(util.format("serial(%s): (re)sending init string (%s) to device(%s)...", _this.id, device.initString, device.id));
                child.stdin.write(device.initString + "\n");
            }
        }, this);
        this.initStringSent = true;
    };
    ArduinoSerialGateway.prototype.restart = function (cmd, args, deferred) {
        var _this = this;
        var self = this;
        var child = child_process.spawn(cmd, args, {
            stdio: ['pipe', 'pipe', 2]
        });
        self.child = child;
        child.once("error", function (err) {
            self.child = null;
            logger.error("failed to spawn child. error: " + err.toString());
            if (deferred) {
                deferred.resolve(true);
                deferred = null;
            }
        });
        child.once("close", function (code) {
            self.child = null;
            logger.debug(util.format("process %s exited with code %d. restarting in 1 second", cmd, code));
            Q.delay(1000).then(function () {
                self.restart(cmd, args);
            });
        });
        child.stdout.pipe(split()).on('data', function (line) {
            var fields = line.split(',');
            //logger.debug(util.format("serial(%s): %s", self.id, line));
            //fields[1] !== self.deviceId
            if (fields.length < 3 || fields[0] !== '0') {
                logger.debug(util.format("serial(%s): IGNORED: %s", self.id, line));
            }
            else if (fields[3] === 'NOT_CONFIGURED') {
                self.sendInitString(child);
                if (deferred) {
                    deferred.resolve(true);
                    deferred = null;
                }
            }
            else if (fields[3] === 'STATE') {
                var publishTopic = util.format("%s/sensor/%s/%s/state/%s", self.topic, self.id, fields[1], fields[4]);
                logger.debug(util.format("serial(%s): new state. publishing %s=%s", self.id, publishTopic, fields[5]));
                self.mqttClient.publish(publishTopic, fields[5]);
            }
            else if (fields[3] == 'PING') {
                if (!_this.initStringSent) {
                    self.sendInitString(child);
                    if (deferred) {
                        deferred.resolve(true);
                        deferred = null;
                    }
                }
            }
            else {
                logger.debug(util.format("serial(%s): IGNORED: %s", self.id, line));
            }
        });
    };
    ArduinoSerialGateway.prototype.start = function () {
        var deferred = Q.defer();
        logger.debug("MqttHub(%s): subscribing to topic: %s", this.id, this.commandTopic);
        this.mqttClient.subscribe(this.commandTopic, { qos: 2 });
        this.mqttClient.on('connect', function () {
            self.mqttClient.subscribe(self.commandTopic, { qos: 2 });
        });
        var self = this;
        this.mqttClient.on('message', function (topic, payload) {
            var payloadString = payload.toString();
            if (topic.substr(0, self.commandTopic.length) === self.commandTopic) {
                logger.debug("MqttHub(%s): received command. topic:%s, payload:%s", self.id, topic, payloadString);
                self.writeString(payloadString);
            }
        });
        if (fs.existsSync(this.port))
            this.restart('./local_serial.sh', [this.port], deferred);
        else
            this.restart('./remote_serial.sh', [this.remoteSSH, this.port], deferred);
        return deferred.promise;
    };
    return ArduinoSerialGateway;
})(Gateway);
exports.ArduinoSerialGateway = ArduinoSerialGateway;
//# sourceMappingURL=gateway.js.map