///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import assert = require('assert')
import _ = require('lodash')
import domainModule = require('domain')

//from 'domain' import {DomainInfo};

import U = require('./u')
import auth = require('./auth')
import itemModule = require('./item')
import serviceModule = require('./service')
import logging = require('./logging');
var logger = new logging.Logger(__filename);

class DomainInfo {
  _parent:DomainInfo;
  _domain:domainModule.Domain;
  _user:auth.User = null;
  _service:serviceModule.Service;
  _itemEvents:itemModule.ItemEvents;

  get domain():domainModule.Domain {
    return this._domain;
  }

  static get active():DomainInfo {
    var dom:any = domainModule;

    assert (!U.isNullOrUndefined(dom.active) || !U.isNullOrUndefined(dom.active.domainInfo));

    return dom.active.domainInfo;
  }

  constructor(parent:DomainInfo) {
    this._parent = parent;
    this._domain = domainModule.create();
    this._domain.on('error', (err) => {
      logger.error("domain error: %s. stack:%s", err, err.stack);
    });

    var dom:any = this._domain;
    dom.domainInfo = this;
  }

  static create(parent:DomainInfo) : DomainInfo {
    return new DomainInfo(parent);
  }

  get parent():DomainInfo {
    return this._parent;
  }

  get user():auth.User {
    if (!U.isNullOrUndefined(this._user)) {
      return this._user;
    } else {
      return this.service.users.getAnonymous();
    }
  }

  set user(u:auth.User) {
    this._user = u;
  }

  static get user():auth.User {
    return DomainInfo.active.user;
  }
  static set user(_user:auth.User) {
    DomainInfo.active.user = _user;
  }
  //------------------------------------------------------------------------------------------
  static get service():serviceModule.Service {
    return DomainInfo.active.service;
  }
  static set service(_service:serviceModule.Service) {
    DomainInfo.active.service = _service;
  }
  get service():serviceModule.Service {
    if (_.isUndefined(this._service) && !U.isNullOrUndefined(this._parent)) {
      return this._parent.service;
    }
    return this._service;
  }
  set service(_service:serviceModule.Service) {
    this._service = _service;
  }
  //------------------------------------------------------------------------------------------
  static get itemEvents():itemModule.ItemEvents {
    return DomainInfo.active.itemEvents;
  }
  static set itemEvents(_itemEvents:itemModule.ItemEvents) {
    DomainInfo.active.itemEvents = _itemEvents;
  }
  get itemEvents():itemModule.ItemEvents {
    if (_.isUndefined(this._itemEvents) && !U.isNullOrUndefined(this._parent)) {
      return this._parent.itemEvents;
    }
    return this._itemEvents;
  }
  set itemEvents(_itemEvents:itemModule.ItemEvents) {
    this._itemEvents = _itemEvents;
  }
}

export = DomainInfo;
