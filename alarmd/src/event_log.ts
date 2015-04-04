///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import assert = require('assert')
import _ = require('lodash')
import sqlite = require('sqlite3')
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
  database:sqlite.Database;

  constructor(database:sqlite.Database) {
    super({
      id: "EventLog"
    });
    this.database = database;
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

    var sql:string = "CREATE TABLE IF NOT EXISTS event_log(\n"
      + "eventTime numeric primary key,\n"
      + "eventType text,\n"
      + "eventMessage   text,\n"
      + "eventSeverity  integer,\n"
      + "eventUser      text,\n"
      + "eventData      text\n"
      + ")";

    self.database.run(sql, (err) => {
      if (err) {
        logger.error("failed to create/open event_log database. error:", err);
        deferred.resolve(false);
      } else {
        deferred.resolve(true);
      }
    });

    return deferred.promise;
  }

  log(event:Event):Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var sql = "insert into event_log\n"
      + "(eventTime, eventType, eventMessage, eventSeverity, eventUser, eventData)\n"
      + "values(?, ?, ?, ?, ?, ?)";

    var dataStr = JSON.stringify(event.data);
    var self = this;
    this.database.run(sql, Event.getUniqueTime(event.time), event.type, event.message, event.severity, event.user, dataStr, (err)=> {
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

    var sql:string = "select * from event_log";
//  public each(sql: string, callback?: (err: Error, row: any) => void, complete?: (err: Error, count: number) => void): Database;

    self.database.each(sql, (err, row) => {
      if (err) {
        logger.error("failed to retrieve record from event_log. error:", err);
      } else {
        var data = null;
        if (!U.isNullOrUndefined(row.eventData))
          data = JSON.parse(row.eventData);
        var event:Event = new Event({
          type: row.eventType,
          message: row.eventMessage,
          severity: row.eventSeverity,
          user: row.eventUser,
          time: row.eventTime,
          data: data
        });
        events.push(event);
      }
    }, (err, count) => {
      if (err) {
        logger.error("failed to retrieve records from event_log. error:", err);
        deferred.reject("failed");
      } else {
        deferred.resolve(events);
      }
    });

    return deferred.promise;
  }
}
