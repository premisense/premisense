///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import assert = require('assert')
import _ = require('lodash')
import NeDB = require('nedb')
import Q = require('q')

import U = require('./u')
import auth = require('./auth')
import itemModule = require('./item')
import serviceModule = require('./service')
import di = require('./domain_info')
import logging = require('./logging')

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

  private _id:string;
  private _type:string;
  private _message:string;
  private _severity:Severity;
  private _user:string;
  private _time:Date;
  private _data:any;

  constructor(o:EventOptions) {
    this._id = null;
    this._type = o.type;
    this._message = o.message;
    this._severity = o.severity;
    this._user = U.isNullOrUndefined(o.user) ? di.service.users.getAdmin().name : o.user;
    this._time = o.time || new Date();
    this._data = o.data;
  }

  get id():string {
    return this._id;
  }

  set id(id:string) {
    assert(U.isNullOrUndefined(this._id));
    this._id = id;
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
      '_id': this._id,
      'type': this._type,
      'message': this._message,
      'time': Math.floor(this._time.valueOf() / 1000),
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
  keepDays:number;

  constructor(filename:string, eventLogKeepDays:number) {
    super({
      id: "EventLog"
    });
    this.database = new NeDB(filename);
    this.keepDays = eventLogKeepDays;
  }

  toJson():any {
    var ret:any = super.toJson();
    ret['type'] = 'EventLog';
    ret['modified'] = this.modified;
    return ret;
  }

  doCleanup():Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var maxTime:number = (new Date().valueOf() / 1000) - this.keepDays * 24 * 60 * 60;
    var query = {
      time: {$lt: maxTime}
    };
    this.database.remove(query, {multi: true}, (err, numRemoved) => {
      if (err) {
        logger.error("cleanup failed. err:", err);
        deferred.reject(err);
      } else {
        logger.info("cleanup completed. removed %d records:", numRemoved);
        deferred.resolve(true);
      }
    });
    return deferred.promise;
  }

  rescheduleCleanup():void {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var self = this;

    Q.delay(24 * 60 * 60 * 1000)
      .then(() => {
        self.rescheduleCleanup(); // for next time

        self.doCleanup();
      });
  }

  start():Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var self = this;

    self.database.loadDatabase((err) => {
      if (err) {
        logger.error("failed to create/open event_log database. error:", err);
        deferred.reject(err);
      } else {

        self.database.persistence.setAutocompactionInterval(24 * 60 * 60 * 1000);
        self.doCleanup()
          .then((result) => {
            self.rescheduleCleanup();
            deferred.resolve(true);
          }, (err) => {
            deferred.reject(err);
          });
      }
    });

    return deferred.promise;
  }

  log(event:Event):Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var self = this;

    var id = event.id;

    if (U.isNullOrUndefined(event.id)) {
      event.id = Event.getUniqueTime(event.time).toString();

      var doc = event.toJson();

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

    } else {
      var doc = event.toJson();

      self.database.update({_id: event.id}, doc, {}, (err, numReplaced, upsert) => {
        if (err) {
          logger.error("failed to update event_log record to database. error:", err);
          deferred.reject(false);
        } else {
          itemModule.transaction(() => {
            self.modified += 1;
          });
          deferred.resolve(true);
        }
      });

    }




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
            time: new Date(doc.time * 1000),
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
