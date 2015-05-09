"use strict";
"use strict";
var assert = require('chai').assert;
var events = require('events');
var util = require('util');
var path = require('path');
var mqtt = require('mqtt');
var child_process = require('child_process');
var fs = require('fs');
var split = require('split');
var _ = require('lodash');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var Gateway = (function() {
  function Gateway() {}
  return ($traceurRuntime.createClass)(Gateway, {start: function() {
      throw "not implemented";
    }}, {});
}());
var ArduinoDevice = (function() {
  function ArduinoDevice(id, initString) {
    assert.argumentTypes(id, $traceurRuntime.type.string, initString, $traceurRuntime.type.string);
    this.id = id;
    this.initString = initString;
  }
  return ($traceurRuntime.createClass)(ArduinoDevice, {
    get id() {
      return assert.returnType((this.$__0), $traceurRuntime.type.string);
    },
    set id(value) {
      assert.argumentTypes(value, $traceurRuntime.type.string);
      this.$__0 = value;
    },
    get initString() {
      return assert.returnType((this.$__1), $traceurRuntime.type.string);
    },
    set initString(value) {
      assert.argumentTypes(value, $traceurRuntime.type.string);
      this.$__1 = value;
    }
  }, {});
}());
Object.defineProperty(ArduinoDevice, "parameters", {get: function() {
    return [[$traceurRuntime.type.string], [$traceurRuntime.type.string]];
  }});
var ArduinoSerialGateway = (function($__super) {
  function ArduinoSerialGateway(mqttClient, topic, id, devices, port, initString) {
    var remoteSSH = arguments[6];
    assert.argumentTypes(mqttClient, mqtt.Client, topic, $traceurRuntime.type.string, id, $traceurRuntime.type.string, devices, $traceurRuntime.genericType(Array, ArduinoDevice), port, $traceurRuntime.type.string, initString, $traceurRuntime.type.string, remoteSSH, $traceurRuntime.type.string);
    ($traceurRuntime.superConstructor(ArduinoSerialGateway).call(this), this.initStringSent = false, this.child = null, this);
    this.id = id;
    this.devices = devices;
    this.initString = initString;
    this.mqttClient = mqttClient;
    this.topic = topic;
    this.commandTopic = util.format("%s/command/%s", this.topic, this.id);
    this.port = port;
    this.remoteSSH = remoteSSH;
  }
  return ($traceurRuntime.createClass)(ArduinoSerialGateway, {
    get mqttClient() {
      return assert.returnType((this.$__2), mqtt.Client);
    },
    set mqttClient(value) {
      assert.argumentTypes(value, mqtt.Client);
      this.$__2 = value;
    },
    get topic() {
      return assert.returnType((this.$__3), $traceurRuntime.type.string);
    },
    set topic(value) {
      assert.argumentTypes(value, $traceurRuntime.type.string);
      this.$__3 = value;
    },
    get commandTopic() {
      return assert.returnType((this.$__4), $traceurRuntime.type.string);
    },
    set commandTopic(value) {
      assert.argumentTypes(value, $traceurRuntime.type.string);
      this.$__4 = value;
    },
    get id() {
      return assert.returnType((this.$__5), $traceurRuntime.type.string);
    },
    set id(value) {
      assert.argumentTypes(value, $traceurRuntime.type.string);
      this.$__5 = value;
    },
    get devices() {
      return assert.returnType((this.$__6), $traceurRuntime.genericType(Array, ArduinoDevice));
    },
    set devices(value) {
      assert.argumentTypes(value, $traceurRuntime.genericType(Array, ArduinoDevice));
      this.$__6 = value;
    },
    get port() {
      return assert.returnType((this.$__7), $traceurRuntime.type.string);
    },
    set port(value) {
      assert.argumentTypes(value, $traceurRuntime.type.string);
      this.$__7 = value;
    },
    get initString() {
      return assert.returnType((this.$__8), $traceurRuntime.type.string);
    },
    set initString(value) {
      assert.argumentTypes(value, $traceurRuntime.type.string);
      this.$__8 = value;
    },
    get remoteSSH() {
      return assert.returnType((this.$__9), $traceurRuntime.type.string);
    },
    set remoteSSH(value) {
      assert.argumentTypes(value, $traceurRuntime.type.string);
      this.$__9 = value;
    },
    get initStringSent() {
      return assert.returnType((this.$__10), $traceurRuntime.type.boolean);
    },
    set initStringSent(value) {
      assert.argumentTypes(value, $traceurRuntime.type.boolean);
      this.$__10 = value;
    },
    get child() {
      return this.$__11;
    },
    set child(value) {
      this.$__11 = value;
    },
    writeString: function(s) {
      assert.argumentTypes(s, $traceurRuntime.type.string);
      if (this.child == null) {
        logger.error(util.format("rejecting command: %s. not connected to device", s));
      } else {
        logger.debug(util.format("sending command: %s. to interface: %s", s, this.id));
        this.child.stdin.write("\n" + s + "\n");
      }
    },
    sendInitString: function(child) {
      var $__12 = this;
      logger.debug(util.format("serial(%s): not_configured. (re)sending init string (%s)...", this.id, this.initString));
      if (this.initString.length > 0) {
        child.stdin.write(this.initString + "\n");
      }
      _.forEach(this.devices, (function(device) {
        if (device.initString.length > 0) {
          logger.debug(util.format("serial(%s): (re)sending init string (%s) to device(%s)...", $__12.id, device.initString, device.id));
          child.stdin.write(device.initString + "\n");
        }
      }), this);
      this.initStringSent = true;
    },
    restart: function(cmd, args, resolve) {
      var $__12 = this;
      assert.argumentTypes(cmd, $traceurRuntime.type.string, args, $traceurRuntime.genericType(Array, $traceurRuntime.type.string), resolve, $traceurRuntime.type.any);
      var self = this;
      var child = child_process.spawn(cmd, args, {stdio: ['pipe', 'pipe', 2]});
      self.child = child;
      child.once("error", (function(err) {
        self.child = null;
        logger.error("failed to spawn child. error: " + err.toString());
        if (resolve) {
          resolve(true);
          resolve = null;
        }
      }));
      child.once("close", (function(code) {
        self.child = null;
        logger.debug(util.format("process %s exited with code %d. restarting in 1 second", cmd, code));
        Q.delay(1000).then((function() {
          self.restart(cmd, args);
        }));
      }));
      child.stdout.pipe(split()).on('data', (function(line) {
        var fields = line.split(',');
        if (fields.length < 3 || fields[0] !== '0') {
          logger.debug(util.format("serial(%s): IGNORED: %s", self.id, line));
        } else if (fields[3] === 'NOT_CONFIGURED') {
          self.sendInitString(child);
          if (resolve) {
            resolve(true);
            resolve = null;
          }
        } else if (fields[3] === 'STATE') {
          var publishTopic = util.format("%s/sensor/%s/%s/state/%s", self.topic, self.id, fields[1], fields[4]);
          logger.debug(util.format("serial(%s): new state. publishing %s=%s", self.id, publishTopic, fields[5]));
          self.mqttClient.publish(publishTopic, fields[5]);
        } else if (fields[3] == 'PING') {
          if (!$__12.initStringSent) {
            self.sendInitString(child);
            if (resolve) {
              resolve(true);
              resolve = null;
            }
          }
        } else {
          logger.debug(util.format("serial(%s): IGNORED: %s", self.id, line));
        }
      }));
    },
    start: function() {
      var $__12 = this;
      logger.debug("MqttHub(%s): subscribing to topic: %s", this.id, this.commandTopic);
      this.mqttClient.subscribe(this.commandTopic, {qos: 2});
      this.mqttClient.on('connect', (function() {
        self.mqttClient.subscribe(self.commandTopic, {qos: 2});
      }));
      var self = this;
      this.mqttClient.on('message', (function(topic, payload) {
        var payloadString = payload.toString();
        if (topic.substr(0, self.commandTopic.length) === self.commandTopic) {
          logger.debug("MqttHub(%s): received command. topic:%s, payload:%s", self.id, topic, payloadString);
          self.writeString(payloadString);
        }
      }));
      return assert.returnType((new Promise((function(resolve, reject) {
        if (fs.existsSync($__12.port))
          $__12.restart('./local_serial.sh', [$__12.port], resolve);
        else
          $__12.restart('./remote_serial.sh', [$__12.remoteSSH, $__12.port], resolve);
      }))), Promise);
    }
  }, {}, $__super);
}(Gateway));
Object.defineProperty(ArduinoSerialGateway, "parameters", {get: function() {
    return [[mqtt.Client], [$traceurRuntime.type.string], [$traceurRuntime.type.string], [$traceurRuntime.genericType(Array, ArduinoDevice)], [$traceurRuntime.type.string], [$traceurRuntime.type.string], [$traceurRuntime.type.string]];
  }});
Object.defineProperty(ArduinoSerialGateway.prototype.writeString, "parameters", {get: function() {
    return [[$traceurRuntime.type.string]];
  }});
Object.defineProperty(ArduinoSerialGateway.prototype.restart, "parameters", {get: function() {
    return [[$traceurRuntime.type.string], [$traceurRuntime.genericType(Array, $traceurRuntime.type.string)], [$traceurRuntime.type.any]];
  }});
Object.defineProperties(module.exports, {
  Gateway: {get: function() {
      return Gateway;
    }},
  ArduinoDevice: {get: function() {
      return ArduinoDevice;
    }},
  ArduinoSerialGateway: {get: function() {
      return ArduinoSerialGateway;
    }},
  __esModule: {value: true}
});
//# sourceMappingURL=gateway.js.map
