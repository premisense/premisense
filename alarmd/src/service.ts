///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import Q = require('q')
import assert = require('assert')
import _ = require('lodash')
import domain = require('domain')
import mqtt = require('mqtt')

import U = require('./u')
import itemModule = require('./item')
import hubModule = require('./hub')
import arming = require('./arming')
import auth = require('./auth')
import web_service = require('./web_service')
import push_notification = require('./push_notification')
import event_log = require('./event_log')
import sensor_history = require('./sensor_history')
import rule_engine = require('./rule_engine')
import di = require('./domain_info')
import logging = require('./logging');
var logger = new logging.Logger(__filename);

import Item = itemModule.Item;
import Group = itemModule.Group;
import transaction = itemModule.transaction;
import Siren = itemModule.Siren;
import Hub = hubModule.Hub;
import PushNotification = push_notification.PushNotification;
import ArmedStates = arming.ArmedStates;
import ArmedState = arming.ArmedState;
import WebService = web_service.WebService;
import RuleEngine = rule_engine.RuleEngine;

export class SystemItems {
  private _all:Group;
  private _armed:Group;
  private _tamper:Group;
  private _delayedSiren:Group;
  private _delayedArmed:Group;
  private _monitor:Group;

  get all():Group {
    return this._all;
  }

  get armed():Group {
    return this._armed;
  }

  get tamper():Group {
    return this._tamper;
  }

  get delayedSiren():Group {
    return this._delayedSiren;
  }

  get delayedArmed():Group {
    return this._delayedArmed;
  }

  get monitor():Group {
    return this._monitor;
  }

  constructor() {
    itemModule.transaction(() => {
      var all = new Group({id: 'all'});
      this._all = all;
      this._armed = new Group({id: 'armed', groups: [all]});
      this._tamper = new Group({id: 'tamper', groups: [all]});
      this._delayedSiren = new Group({id: 'delayedSiren', groups: [all]});
      this._delayedArmed = new Group({id: 'delayedArmed', groups: [all]});
      this._monitor = new Group({id: 'monitor', groups: [all]});
    }, this);
  }

}

export class ServiceOptions {
  items:SystemItems;
  mqttClient:mqtt.Client;
  armedStates:ArmedStates;
  siren:Siren;
  users:auth.Users;
  webService:WebService;
  pushNotification:PushNotification;
  hubs:Hub[];
  ruleEngine:RuleEngine;
  eventLog:event_log.EventLog;
  sensorHistory:sensor_history.SensorHistory;
  domainInfo:di;
}

export class Service {
  private _items:SystemItems;
  private _hubs:Hub[];
  private _armedStates:ArmedStates;
  private _siren:Siren;
  private _users:auth.Users;
  private _ruleEngine:RuleEngine;
  private _eventLog:event_log.EventLog;
  private _sensorHistory:sensor_history.SensorHistory;

  private _pushNotification:PushNotification;
  private  _webService:WebService;
  private _domainInfo:di;
  private _mqttClient:mqtt.Client;

  get pushNotification():PushNotification {
    return this._pushNotification;
  }

  get ruleEngine():RuleEngine {
    return this._ruleEngine;
  }

  get users():auth.Users {
    return this._users;
  }

  get armedStates():ArmedStates {
    return this._armedStates;
  }

  get items():SystemItems {
    return this._items;
  }

  get siren():Siren {
    return this._siren;
  }

  get eventLog():event_log.EventLog {
    return this._eventLog;
  }

  get sensorHistory():sensor_history.SensorHistory {
    return this._sensorHistory;
  }

  get webService():WebService {
    return this._webService;
  }

  get mqttClient():mqtt.Client {
    return this._mqttClient;
  }

  constructor(o:ServiceOptions) {
    assert (U.isNullOrUndefined(o.domainInfo.service));
    o.domainInfo.service = this;

    this._items = o.items;
    this._hubs = o.hubs;
    this._armedStates = o.armedStates;
    this._webService = o.webService;
    this._users = o.users;
    this._siren = o.siren;
    this._armedStates.addParent(o.items.all);
    this._ruleEngine = o.ruleEngine;
    this._pushNotification = o.pushNotification;
    this._eventLog = o.eventLog;
    this._sensorHistory = o.sensorHistory;
    this._domainInfo = o.domainInfo;
    this._mqttClient = o.mqttClient;
  }

  start():Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();


    logger.debug("waiting for mqtt connection");

    var started:boolean = false;

    var self = this;

    this._domainInfo.domain.run(() => {
      this.mqttClient.on('connect', () => {
        if (!started) {
          started = true;
          logger.debug("connected to mqtt. starting service...");
          self._start(deferred);
          deferred.promise.then((result) => {
            if (result)
              logger.info("service started");
            else {
              logger.info("failed to start service. exiting");
              process.exit(1);
            }
          })
        } else {
          logger.info("reconnected to mqtt. re-subscribing to topics...");
        }
      });

      self.mqttClient.on('disconnect', () => {
        logger.warn("disconnected from mqtt");
      });
      self.mqttClient.on('close', () => {
        logger.warn("mqtt closed connection");
      });

      self.mqttClient.on('error', (err) => {
        logger.warn("mqtt error: " + err);
      });
    });

    return deferred.promise;
  }

  _start(deferred:Q.Deferred<boolean>):void {
    var self = this;

    this.eventLog.start()
      .then((result) => {
        if (!result) {
          deferred.resolve(false);
        } else {

          this.sensorHistory.start()
            .then((result) => {
              if (!result) {
                deferred.resolve(false);
              } else {
                logger.info("activating armedState:%s", this.armedStates.states[0].name);
                this.armedStates.states[0].activate()
                  .then(() => {

                    var startHubs:Q.Promise<boolean>[] = [];

                    logger.debug("starting hubs...");

                    _.forEach(self._hubs, (hub) => {
                      startHubs.push(hub.start());
                    }, self);

                    Q.allSettled(startHubs)
                      .then(() => {

                        logger.debug("starting rule engine...");
                        self._ruleEngine.start()
                          .then(() => {

                            logger.debug("starting web service...");

                            self._webService.start()
                              .then(() => {

                                // first run
                                self._ruleEngine.run();

                                this.eventLog.log(new event_log.Event({
                                  type: 'service',
                                  message: 'started',
                                  user: null,
                                  severity: event_log.Severity.INFO
                                }));

                                deferred.resolve(true);
                              });
                          });
                      });
                  });

              }
            });
        }
      });
  }
}
