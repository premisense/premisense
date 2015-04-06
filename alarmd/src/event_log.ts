///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import assert = require('assert')
import _ = require('lodash')
import NeDB = require('nedb')
import Q = require('q')

import U = require('./u')
import auth = require('./auth');
import itemModule = require('./item');
import serviceModule = require('./service');
import logging = require('./logging');
var logger = new logging.Logger(__filename);


export enum Severity {
  INFO = 0,
  NOTICE = 1,
  WARNING = 2,
  ALERT = 3
}

export interface EventOptions {
  type:string;
  message:string;
  severity:Severity;
  user:string;
  time ?: Date;
  data ?: any;
}

export class Event {
  static lastSeq:number = 0;

  static getUniqueTime(time:Date):number {
    Event.lastSeq += 1;
    var seq = Event.lastSeq;
    var uniqueTime = Math.floor(time.getTime() / 1000) + (seq / 1000000.0);
    return uniqueTime;
  }

  private _type:string;
  private _message:string;
  private _severity:Severity;
  private _user:string;
  private _time:Date;
  private _data:any;

  constructor(o:EventOptions) {
    this._type = o.type;
    this._message = o.message;
    this._severity = o.severity;
    this._user = U.isNullOrUndefined(o.user) ? serviceModule.Service.instance.users.getAdmin().name : o.user;
    this._time = o.time || new Date();
    this._data = o.data;
  }

  get type():string {
    return this._type;
  }

  get message():string {
    return this._message;
  }

  get user():string {
    return this._user;
  }

  get time():Date {
    return this._time;
  }

  get data():any {
    return this._data;
  }

  set data(d:any) {
    this._data = d;
  }

  get severity():Severity {
    return this._severity;
  }

  set severity(s:Severity) {
    this._severity = s;
  }

  toJson():any {
    var ret:any = {
      'type': this._type,
      'message': this._message,
      'time': this._time,
      'severity': this._severity,
      'data': this._data,
      'user': this._user
    };
    return ret;
  }
}

export class EventLog extends itemModule.Item {
  modified:number = 0;
  database:NeDB;

  constructor(filename:string) {
    super({
      id: "EventLog"
    });
    this.database = new NeDB(filename);
  }

  toJson():any {
    var ret:any = super.toJson();
    ret['type'] = 'EventLog';
    ret['modified'] = this.modified;
    return ret;
  }


  start():Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var self = this;

    self.database.loadDatabase((err) => {
      if (err) {
        logger.error("failed to create/open event_log database. error:", err);
        deferred.resolve(false);
      } else {

        self.database.persistence.setAutocompactionInterval(24 * 60 * 60 * 1000);
        deferred.resolve(true);
      }
    });

    return deferred.promise;
  }

  log(event:Event):Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var self = this;

    var doc = {
      time: Event.getUniqueTime(event.time),
      type: event.type,
      message: event.message,
      severity: event.severity,
      user: event.user,
      data: event.data
    };

    self.database.insert(doc, (err) => {
      if (err) {
        logger.error("failed to insert event_log record to database. error:", err);
        deferred.reject(false);
      } else {
        itemModule.transaction(() => {
          self.modified += 1;
        });
        deferred.resolve(true);
      }
    });

    return deferred.promise;
  }

  query():Q.Promise<Event[]> {
    var deferred:Q.Deferred<Event[]> = Q.defer<Event[]>();
    var self = this;

    var events:Event[] = [];

    self.database.find({}, (err, docs) => {
      if (err) {
        logger.error("failed to retrieve record from event_log. error:", err);
      } else {
        _.forEach(docs, (doc:any) => {
          var event:Event = new Event({
            type: doc.type,
            message: doc.message,
            severity: doc.severity,
            user: doc.user,
            time: doc.time,
            data: doc.data
          });
          events.push(event);
        });
      }
      deferred.resolve(events);
    });

    return deferred.promise;
  }
}
