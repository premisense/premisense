///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import assert = require('assert')
import _ = require('lodash')
import domain = require('domain')

import U = require('./u')
import auth = require('./auth')
import serviceModule = require('./service')
import logging = require('./logging');
var logger = new logging.Logger(__filename);

export class DomainInfo {
  _user:auth.User = null;
  static _global:DomainInfo = new DomainInfo();

  static get global():DomainInfo {
    return DomainInfo._global;
  }

  static get active():DomainInfo {
    var dom:any = domain;
    if (U.isNullOrUndefined(dom.active) || U.isNullOrUndefined(dom.active.domainInfo)) {
      return DomainInfo._global;
    } else {
      return dom.active.domainInfo;
    }
  }

  constructor() {
  }

  get user():auth.User {
    if (!U.isNullOrUndefined(this._user)) {
      return this._user;
    } else {
      return serviceModule.Service.instance.users.getAnonymous();
    }
  }

  set user(u:auth.User) {
    this._user = u;
  }
}
