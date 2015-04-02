///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import assert = require('assert')
import Q = require('q')
import mqtt = require('mqtt')
import _ = require('lodash')

import itemModule = require('./item')
import logging = require('./logging');
var logger = new logging.Logger(__filename);

import Sensor = itemModule.Sensor;

export interface HubOptions {
  id:string;
}

export class Hub {
  private _id:string;

  get id() : string {
    return this._id;
  }

  constructor(o:HubOptions) {
    this._id = o.id;
  }

  start():Q.Promise<boolean> {
    throw "not implemented";
  }

}

export interface MqttHubDeviceOptions {
  id:string;
  sensors:Sensor[];
}

export class MqttHubDevice {
  id: string;
  private _sensors:{[key: number]: Sensor} = {};
  private _items:{[key: string]: Sensor} = {};

  constructor(o:MqttHubDeviceOptions) {
    this.id = o.id;

    _.forEach(o.sensors, (sensor) => {
      assert (_.isUndefined(this._sensors[sensor.gpioId]));
      assert (_.isUndefined(this._items[sensor.id]));

      this._sensors[sensor.gpioId] = sensor;
      this._items[sensor.id] = sensor;
    });
  }
  processMessage(topicParts:string[], payload:string):void {
    var gpioId : number = parseInt(topicParts[topicParts.length-1]);
    var item = this._sensors[gpioId];
    assert (item == null || item instanceof Sensor);
    if (item != null && item instanceof Sensor) {
      var sensor:Sensor = item;

      itemModule.transaction(() => {
        sensor.state = payload;
      });
    }
  }
}

export interface MqttHubOptions extends HubOptions {
  client:mqtt.Client;
  topicRoot:string
  devices:MqttHubDevice[];
}

export class MqttHub extends Hub {
  private mqttClient : mqtt.Client;
  private topicRoot:string;
  private devices:MqttHubDevice[];

  constructor(o:MqttHubOptions) {

    super(o);
    this.mqttClient = o.client;
    this.topicRoot = o.topicRoot;
    this.devices = o.devices;
    if (this.topicRoot[this.topicRoot.length-1] !== '/')
      this.topicRoot += '/';
  }

  private processMessage(topicParts:string[], payload:string):void {
    _.forEach(this.devices, (device) => {
      if (device.id === topicParts[0]) {
        device.processMessage(topicParts, payload);
      }
    }, this);
  }

  start():Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    logger.debug("MqttHub(%s): starting", this.id);

    var self = this;
    var topic = util.format("%s+/state/+", this.topicRoot);

    logger.debug("MqttHub(%s): subscribing to topic: %s", this.id, topic);

    this.mqttClient.subscribe(topic, {qos: 2});

    // re-subscribe to our topic
    this.mqttClient.on('connect', () => {
      self.mqttClient.subscribe(topic, {qos: 2});
    });

      this.mqttClient.on('message', (topic:string, payload:any) => {
      if (topic.substr(0, self.topicRoot.length) === self.topicRoot) {

        logger.debug("MqttHub(%s): received message. topic:%s, payload:%s", this.id, topic, payload);

        var relativeTopic = topic.substr(self.topicRoot.length);
        var topicParts : string[] = relativeTopic.split('/');

        self.processMessage(topicParts, payload.toString());
      }
    });

    deferred.resolve(true);
    return deferred.promise;
  }
}

