///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import assert = require('assert')
import _ = require('lodash')

import U = require('./u')
import itemModule = require('./item')
import logging = require('./logging');
var logger = new logging.Logger(__filename);

export class UserSession extends itemModule.NumericSensor {
  constructor(o:itemModule.SensorOptions) {
    super(o);
  }

  toJson():any {
    var ret:any = super.toJson();
    ret['type'] = 'UserSession';
    return ret;
  }
}


export interface UserOptions extends itemModule.ItemOptions {
  password: string;
  accessRestApi:boolean;
  pinCode: string;
  forcePinCode:boolean;
}

export class User extends itemModule.Group {

  public static get ADMIN():string {
    return "admin";
  }

  public static get ANONYMOUS():string {
    return "anonymous";
  }

  password:string;
  accessRestApi:boolean;
  pinCode:string;
  forcePinCode:boolean;
  _loginSensor:UserSession;
  _kioskSensor:UserSession;

  private static formatItemId(id:string, name:string):string {
    return util.format("%s:%s", id, name);
  }

  constructor(o:UserOptions) {
    super(_.clone(o, false, (o) => {
      o.minor = true;
      o.name = o.id;
      o.id = "user:" + o.id;
    }));



    this.password = o.password;
    this.accessRestApi = o.accessRestApi;
    this.pinCode = o.pinCode;
    this.forcePinCode = o.forcePinCode;

    this._kioskSensor = new UserSession({id: User.formatItemId(this.id, "kiosk"), groups: [this], minor: true});
    this._loginSensor = new UserSession({id: User.formatItemId(this.id, "login"), groups: [this], minor: true});
  }

  get loginSensor():UserSession {
    return this._loginSensor;
  }

  get kioskSensor():UserSession {
    return this._kioskSensor;
  }

}

export interface UsersOptions extends itemModule.ItemOptions {
  users: User[];
  bypassAuthIps: {[key:string]:boolean};
}


export class Users extends itemModule.Group {
  private _bypassAuthIps:{[key:string]:boolean} = {};

  constructor(o:UsersOptions) {
    super(o);

    this._bypassAuthIps = o.bypassAuthIps;

    _.forEach(o.users, (user) => {
      user.addParent(this);
    }, this);

    if (!this.getUser(User.ADMIN))
      new User({
        id: User.ADMIN,
        password: null,
        accessRestApi: true,
        pinCode: null,
        forcePinCode: false,
        metadata: null
      }).addParent(this);

    if (!this.getUser(User.ANONYMOUS))
      new User({
        id: User.ANONYMOUS,
        password: null,
        accessRestApi: false,
        pinCode: null,
        forcePinCode: false,
        metadata: null
      }).addParent(this);
  }

  getUser(name:string):User {
    var userFullId = util.format("user:%s", name).toLowerCase();
    var item = this._childItems[userFullId];
    if (U.isNullOrUndefined(item))
      return null;
    assert(item instanceof User);
    var user:User = <User> item;
    return user;
  }

  isBypassAuthIp(ip:string):boolean {
    return this._bypassAuthIps[ip] === true;
  }

  getAdmin():User {
    return this.getUser(User.ADMIN);
  }

  getAnonymous():User {
    return this.getUser(User.ANONYMOUS);
  }

  private _authenticate(name:string, password:string):User {
    var user:User = this.getUser(name);
    if (user == null)
      return null;

    // users without password cannot be authenticated
    if (user.password == null)
      return null;

    if (user.password != password)
      return null;

    return user;
  }

  public authenticate(name:string, password:string):User {
    var user = this._authenticate(name, password);
    if (user == null)
      logger.warning("authentication failed. name:%s, pass:%s", name, password);

    return user;
  }

}
