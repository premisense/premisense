///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import request = require('request')
//import formdata = require('form-data')
import url = require('url')
import querystring = require('querystring')
import Q = require('q')
import _ = require('lodash')

import U = require('./u')
import itemModule = require('./item')
import logging = require('./logging');
var logger = new logging.Logger(__filename);

export enum Priority {
  NORMAL = 0,
  HIGH = 1,
  CRITICAL = 2
}

export interface MessageOptions {
  title:string;
  body:string;
  priority?:Priority;
}

export class Message {
  title:string;
  body:string;
  priority:Priority;

  constructor(o:MessageOptions) {
    this.title = o.title;
    this.body = o.body;
    this.priority = o.priority;
  }
}

export class PushNotification {
  constructor() {

  }

  send(msg:Message):Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    deferred.resolve(true);
    return deferred.promise;
  }
}

export interface PushoverMessageOptions extends MessageOptions {
  appKey?:string;
  userKey?:string;
  sound?:string;
}

export class PushoverMessage extends Message {
  appKey:string;
  userKey:string;
  sound:string;

  constructor(o:PushoverMessageOptions) {
    super(o);
    this.appKey = o.appKey;
    this.userKey = o.userKey;
    this.sound = o.sound;
  }
}

export interface PushoverOptions {
  defaultAppKey?:string;
  defaultUserKey?:string;
  defaultTitle?:string;
  defaultSound?:string;
  defaultPriority?:Priority;
  prioritySoundMap?:{[priority:number]: string};
  localAddress?:string;
}

export class Pushover extends PushNotification {
  defaultAppKey:string;
  defaultUserKey:string;
  defaultTitle:string;
  defaultPriority:Priority;
  defaultSound:string;
  prioritySoundMap:{[priority:number]: string};
  localAddress:string;
  static priorityMap:{[priority:number]:number} = {
    0: 0,
    1: 1,
    2: 2
  };

  constructor(o:PushoverOptions) {
    super();

    this.defaultAppKey = o.defaultAppKey;
    this.defaultUserKey = o.defaultUserKey;
    this.defaultTitle = o.defaultTitle;
    this.defaultPriority = o.defaultPriority;
    this.defaultSound = o.defaultSound;
    this.prioritySoundMap = o.prioritySoundMap;
    this.localAddress = o.localAddress;
  }

  send(msg:Message):Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var pmsg:PushoverMessage;
    if (msg instanceof PushoverMessage)
      pmsg = msg;
    else {
      pmsg = new PushoverMessage({
        title: msg.title,
        body: msg.body,
        priority: msg.priority
      });
    }

    var params = {
      token: (!U.isNullOrUndefined(pmsg.appKey)) ? pmsg.appKey : this.defaultAppKey,
      user: (!U.isNullOrUndefined(pmsg.userKey)) ? pmsg.userKey : this.defaultUserKey,
      title: (!U.isNullOrUndefined(pmsg.title)) ? pmsg.title : this.defaultTitle,
      message: pmsg.body
    };

    var priority:Priority = (pmsg.priority != null) ? pmsg.priority : this.defaultPriority;
    var pushoverPriority:number;
    if (priority == null || U.isNullOrUndefined(Pushover.priorityMap[priority]))
      pushoverPriority = -1;
    else
      pushoverPriority = Pushover.priorityMap[priority];

    params['priority'] = pushoverPriority;

    if (pushoverPriority == 2) {
      params['retry'] = "30";
      params['expire'] = "600";
    }

    var sound:string = pmsg.sound;
    if (U.isNullOrUndefined(sound)) {
      if (!U.isNullOrUndefined(priority) && !U.isNullOrUndefined(this.prioritySoundMap))
        sound = this.prioritySoundMap[priority];
    }

    if (U.isNullOrUndefined(sound))
      sound = this.defaultSound;

    if (!U.isNullOrUndefined(sound))
      params['sound'] = sound;

    //var formData = new formdata.FormData();
    //_.forEach(params, (v,k) => {
    //  formData.append(k, v);
    //});
    var u = "https://api.pushover.net:443/1/messages.json";

    var arequest:any = request;
    arequest.post({url:u, formData:params, localAddress:this.localAddress}, (error, response, body) => {
      if (!error && response.statusCode == 200) {
        logger.info("pushover notification completed. body: ", body);
        deferred.resolve(true);
      } else {
        logger.info("pushover notification failed. error:%s. %s", response.statusCode, body);
        deferred.resolve(false);
      }
    });

    return deferred.promise;
  }
}
