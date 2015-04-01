///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import Q = require('q')
import assert = require('assert')
import path = require('path');
import mqtt = require('mqtt')
import child_process = require("child_process");
import fs = require('fs')
import split = require('split')
import _ = require('lodash')

import logging = require('./logging');
var logger = new logging.Logger(__filename);

export class Gateway {
  constructor() {

  }

  start():Q.Promise<boolean> {
    throw "not implemented"
  }
}

export class ArduinoDevice {
  id:string;
  initString:string;

  constructor(id:string,
              initString:string) {
    this.id = id;
    this.initString = initString;
  }
}

export class ArduinoSerialGateway extends Gateway {
  mqttClient:mqtt.Client;
  topic:string;
  commandTopic:string;
  id:string;
  devices:ArduinoDevice[];
  port:string;
  initString:string;
  remoteSSH:string;
  private initStringSent:boolean = false;
  private child:child_process.ChildProcess = null;

  constructor(mqttClient:mqtt.Client,
              topic:string,
              id:string,
              devices:ArduinoDevice[],
              port:string,
              initString:string,
              remoteSSH ?:string) {
    super();
    this.id = id;
    this.devices = devices;
    this.initString = initString;
    this.mqttClient = mqttClient;
    this.topic = topic;
    this.commandTopic = util.format("%s/command/%s", this.topic, this.id);

    this.port = port;
    this.remoteSSH = remoteSSH;
  }

  private writeString(s: string) : void {
    if (this.child == null) {
      logger.error(util.format("rejecting command: %s. not connected to device", s));
    } else {
      logger.debug(util.format("sending command: %s. to interface: %s", s, this.id));
      this.child.stdin.write("\n" + s + "\n");
    }
  }

  private sendInitString(child:child_process.ChildProcess) {

    logger.debug(util.format("serial(%s): not_configured. (re)sending init string (%s)...", this.id, this.initString));

    if (this.initString.length > 0) {
      child.stdin.write(this.initString + "\n");
    }

    _.forEach(this.devices, (device) => {
      if (device.initString.length > 0) {
        logger.debug(util.format("serial(%s): (re)sending init string (%s) to device(%s)...", this.id, device.initString, device.id));
        child.stdin.write(device.initString + "\n");
      }
    }, this);

    this.initStringSent = true;
  }

  private restart(cmd:string, args:string[], deferred?:Q.Deferred<boolean>):void {
    var self = this;

    var child = child_process.spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 2]
    });

    self.child = child;

    child.once("error", (err) => {
      self.child = null;
      logger.error("failed to spawn child. error: " + err.toString());
      if (deferred) {
        deferred.resolve(true);
        deferred = null;
      }
    });

    child.once("close", (code) => {
      self.child = null;
      logger.debug(util.format("process %s exited with code %d. restarting in 1 second", cmd, code));
      Q.delay(1000).then(() => {
        self.restart(cmd, args)
      });
    });

    child.stdout.pipe(split())
      .on('data', (line) => {
        var fields = line.split(',');
        //logger.debug(util.format("serial(%s): %s", self.id, line));

        //fields[1] !== self.deviceId

        if (fields.length < 3 || fields[0] !== '0') {
          logger.debug(util.format("serial(%s): IGNORED: %s", self.id, line))


        } else if (fields[3] === 'NOT_CONFIGURED') {

          self.sendInitString(child);
          if (deferred) {
            deferred.resolve(true);
            deferred = null;
          }


        } else if (fields[3] === 'STATE') {

          var publishTopic = util.format("%s/sensor/%s/%s/state/%s", self.topic, self.id, fields[1], fields[4]);

          logger.debug(util.format("serial(%s): new state. publishing %s=%s", self.id, publishTopic, fields[5]));

          self.mqttClient.publish(publishTopic, fields[5]);


        } else if (fields[3] == 'PING') {

          if (!this.initStringSent) {

            self.sendInitString(child);

            if (deferred) {
              deferred.resolve(true);
              deferred = null;
            }
          }

        } else {
          logger.debug(util.format("serial(%s): IGNORED: %s", self.id, line))
        }
      });

  }

  start():Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    logger.debug("MqttHub(%s): subscribing to topic: %s", this.id, this.commandTopic);
    this.mqttClient.subscribe(this.commandTopic, {qos: 2});
    this.mqttClient.on('connect', () => {
      self.mqttClient.subscribe(self.commandTopic, {qos: 2});
    });

    var self = this;
    this.mqttClient.on('message', (topic:string, payload:any) => {
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
  }
}



