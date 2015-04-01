///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import Q = require('q')
import assert = require('assert')
import _ = require('lodash')

import U = require('./u')
import itemModule = require('./item')
import hubModule = require('./hub')
import arming = require('./arming')
import auth = require('./auth')
import web_service = require('./web_service')
import push_notification = require('./push_notification')
import rule_engine = require('./rule_engine')
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
  armedStates:ArmedStates;
  siren:Siren;
  users:auth.Users;
  webService:WebService;
  pushNotification:PushNotification;
  hubs:Hub[];
  ruleEngine:RuleEngine;
}

export class Service {
  private static _instance:Service = null;

  static get instance():Service {
    assert(Service._instance != null);
    return Service._instance;
  }

  private _items:SystemItems;
  private _hubs:Hub[];
  private _armedStates:ArmedStates;
  private siren:Siren;
  private _users:auth.Users;
  private _ruleEngine:RuleEngine;

  private _pushNotification:PushNotification;
  private  webService:WebService;
  private _events:itemModule.ItemEvents = itemModule.ItemEvents.instance;
  //TODO final EventLog eventLog = new EventLog();

  get pushNotification():PushNotification {
    return this._pushNotification;
  }

  get ruleEngine():RuleEngine {
    return this._ruleEngine;
  }

  get users():auth.Users {
    return this._users;
  }

  get events():itemModule.ItemEvents {
    return this._events;
  }

  get armedStates():ArmedStates {
    return this._armedStates;
  }

  get items():SystemItems {
    return this._items;
  }

  constructor(o:ServiceOptions) {
    assert(Service._instance == null);
    Service._instance = this;

    this._items = o.items;
    this._hubs = o.hubs;
    this._armedStates = o.armedStates;
    this.webService = o.webService;
    this._users = o.users;
    this.siren = o.siren;
    this._armedStates.addParent(o.items.all);
    this._ruleEngine = o.ruleEngine;
    this._pushNotification = o.pushNotification;
  }

  start():Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var self = this;

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

                self.webService.start()
                  .then(() => {

                    // first run
                    self._ruleEngine.run();

                    deferred.resolve(true);
                  });
              });
          });

      });

    return deferred.promise;
  }
}
