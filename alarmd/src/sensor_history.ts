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

export class ItemHistory {
  history:{[key:number]: number} = {};
}

export class SensorHistory {
  database:sqlite.Database;
  history:{[key:string]: ItemHistory} = {};

  constructor(database:sqlite.Database) {
    this.database = database;
  }

  private persist():void {
    var sql = "insert into sensor_history (sensorId, eventTime, detectCount) values (?, ?, ?)";

    var now = new Date();
    var currentSlot:number = Math.floor(now.getTime() / 1000 / 300) * 300;

    var self = this;

    // clone keys to avoid iteration while modifying
    var items = _.clone(Object.keys(this.history));

    this.database.serialize(() => {
      _.forEach(items, (id) => {
        var itemHistory:ItemHistory = this.history[id];
        if (itemHistory) {
          // clone keys to avoid iteration while modifying
          var slots:string[] = _.clone(Object.keys(itemHistory.history));

          _.forEach(slots, (slot) => {
            if (parseInt(slot) !== currentSlot) {
              var count = itemHistory.history[slot];
              if (!_.isUndefined(count) && count > 0) {
                this.database.run(sql, id, slot, count, (err) => {
                  if (itemHistory.history[slot]) {
                    itemHistory.history[slot] -= count;
                    if (itemHistory.history[slot] == 0) {
                      delete itemHistory.history[slot];

                      var tmp = this.history[id];
                      if (Object.keys(tmp.history).length == 0)
                        delete this.history[id];
                    }
                  }
                  if (err) {
                    logger.error("failed to insert record into sensor_history database. error:", err);
                  }
                });
              }
            }
          }, self);
        }
      }, self);
    });
  }

  private reschedulePersist():void {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var self = this;

    Q.delay(5 * 60 * 1000)
      .then(() => {
        self.reschedulePersist(); // for next time
        self.persist();
      });
  }


  start():Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var self = this;

    var sql:string = "CREATE TABLE IF NOT EXISTS sensor_history(\n"
      + "sensorId text,\n"
      + "eventTime numeric,\n"
      + "detectCount  integer,\n"
      + "primary key (sensorId, eventTime)\n"
      + ")";

    self.database.run(sql, (err) => {
      if (err) {
        logger.error("failed to create/open sensor_history database. error:", err);
        deferred.resolve(false);
      } else {
        self.reschedulePersist();
        deferred.resolve(true);
      }
    });


    return deferred.promise;
  }

  add(slot:number, id:string):void {
    var itemHistory = this.history[id];
    if (!itemHistory) {
      itemHistory = new ItemHistory();
      this.history[id] = itemHistory;
    }

    if (!itemHistory.history[slot])
      itemHistory.history[slot] = 1;
    else
      itemHistory.history[slot] += 1;
  }

  query(id:string):Q.Promise<ItemHistory> {
    var deferred:Q.Deferred<ItemHistory> = Q.defer<ItemHistory>();
    var self = this;

    var itemHistory:ItemHistory = new ItemHistory();

    var sql:string = "select * from sensor_history where sensorId = ?";
//  public each(sql: string, callback?: (err: Error, row: any) => void, complete?: (err: Error, count: number) => void): Database;

    self.database.each(sql, id, (err, row) => {
      if (err) {
        logger.error("failed to retrieve record from sensor_history. error:", err);
      } else {
        itemHistory.history[row.eventTime] = row.detectCount;
      }
    }, (err, count) => {
      if (err) {
        logger.error("failed to retrieve records from sensor_history. error:", err);
        deferred.reject("failed");
      } else {
        var pendingUpdates = this.history[id];
        if (!U.isNullOrUndefined(pendingUpdates)) {
          _.forEach(pendingUpdates.history, (v, k) => {
            itemHistory.history[k] = v;
          });
        }
        deferred.resolve(itemHistory);
      }
    });

    return deferred.promise;
  }
}
