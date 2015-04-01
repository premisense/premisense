///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import assert = require('assert')
import Q = require('q')
import _ = require('lodash')

import U = require('./u')
import itemModule = require('./item')
import service = require('./service')

import logging = require('./logging');
var logger = new logging.Logger(__filename);

import Item = itemModule.Item;
import ItemOptions = itemModule.ItemOptions;
import Group = itemModule.Group;
import transaction = itemModule.transaction;

export class WouldTriggerItem {

  private _item:Item;
  firstTriggered:Date;
  lastTriggered:Date;
  count:number;

  constructor(item:Item) {
    this.count = 1;
    this.firstTriggered = new Date();
    this.lastTriggered = this.firstTriggered;
  }

  toJson():any {
    return {
      'count': this.count,
      'firstTriggered': Math.floor(this.firstTriggered.valueOf() / 1000),
      'lastTriggered': Math.floor(this.lastTriggered.valueOf() / 1000)
    };
  }
}

export class TriggeredItem {
  private _item:Item;
  firstTriggered:Date;
  lastTriggered:Date;
  count:number;

  constructor(item:Item) {
    this.count = 1;
    this.firstTriggered = new Date();
    this.lastTriggered = this.firstTriggered;
  }

  toJson():any {
    return {
      'count': this.count,
      'firstTriggered': Math.floor(this.firstTriggered.valueOf() / 1000),
      'lastTriggered': Math.floor(this.lastTriggered.valueOf() / 1000)
    };
  }
}

export interface ArmedStateOptions extends ItemOptions {
  systemItems:service.SystemItems;
  securityLevel?:number;
  order?:number;
  timeout?:number;
  sirenDelay?:number;
}

export class ArmedState extends Group {
  private securityLevel:number;
  private order:number;
  private timeout:number;
  private sirenDelay:number = 0;
  private _startTime:Date = null;
   lastSiren:Date = null;
  triggeredItems:{[key:string]: TriggeredItem} = {};
   wouldTriggerItems:{[key:string]: WouldTriggerItem} = {};
  bypassedItems:{[key:string]: Item} = {};

  constructor(o:ArmedStateOptions) {
    super(o);
    this.securityLevel = !U.isNullOrUndefined(o.securityLevel) ? o.securityLevel : 0;
    this.order = !U.isNullOrUndefined(o.order) ? o.order : 0;
    this.timeout = !U.isNullOrUndefined(o.timeout) ? o.timeout : 0;
    this.sirenDelay = !U.isNullOrUndefined(o.sirenDelay) ? o.sirenDelay : 0;

    this.addParent(o.systemItems.all);
    o.systemItems.tamper.addParent(this);
  }

  get startTime():Date {
    return this._startTime;
  }

  _checkNotifyChangedTimeLeft():void {
    var self = this;
    if (this.timeLeft > 0) {
      Q.delay(500)
        .then(() => {
          self.notifyChanged();
          self._checkNotifyChangedTimeLeft();
        });
    }
  }

  set startTime(newStartTime:Date) {
    this._startTime = newStartTime;
    this._checkNotifyChangedTimeLeft();
  }

  get timeLeft():number {
    if (this.startTime == null)
      return 0;
    var left:number = Math.floor((this.startTime.valueOf() - Date.now()) / 1000);
    return (left < 0) ? 0 : left;
  }

  toJson():any {
    var ret:any = super.toJson();
    ret['type'] = 'ArmedState';
    ret['securityLevel'] = this.securityLevel;
    ret['order'] = this.order;
    ret['startTime'] = (this.startTime == null) ? null : this.startTime.valueOf;
    ret['armingTimeLeft'] = this.timeLeft;
    ret['armingTimeout'] = this.timeout;
    ret['lastSiren'] = (this.lastSiren == null) ? null : this.lastSiren.valueOf;
    ret['triggeredItems'] = this.triggeredItems;
    ret['wouldTriggerItems'] = this.wouldTriggerItems;
    ret['bypassedItems'] = this.bypassedItems;
    ret['metadata'] = this.metadata;
    return ret;
  }

  _clear():void {
    transaction(() => {
      this.notifyChanged();

      this.triggeredItems = {};
      this.wouldTriggerItems = {};
      this.bypassedItems = {};
      this.lastSiren = null;
      this.startTime = null;
    }, this);
  }

  _deactivate():void {
    this._clear();
  }

  _activate():Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var self = this;

    transaction(() => {
      self.notifyChanged();

      self._clear();
      self.startTime = new Date(Date.now() + 1000 * this.timeout);
    });

    deferred.resolve(true);
    return deferred.promise;
  }

  isActive():boolean {
    return service.Service.instance.armedStates.active == this;
  }

  activate():Q.Promise<boolean> {
    return service.Service.instance.armedStates.activate(this);
  }

  bypass(item:Item):void {
    var self = this;
    transaction(() => {
      if (item instanceof Group) {
        var group:Group = item;
        group.forEachItem(self.bypass, this);
        return;
      }

      assert(this.at(item.id) == item);

      if (!self.bypassedItems[item.id]) {
        this.bypassedItems[item.id] = item;
        this.notifyChanged();
      }
    });

  }

  updateLogEvent():void {
//TODO add updateLogEvent
    this.notifyChanged();
  }

}

export interface ArmedStatesOptions extends ItemOptions {
  armedStates:ArmedState[];
}


export class ArmedStates extends Group {

  private _prev:ArmedState;
  private  _active:ArmedState;
  private _statesArray:ArmedState[];
  private _statesMap:{ [key: string] : ArmedState} = {};

  get active():ArmedState {
    return this._active;
  }

  get prev():ArmedState {
    return this._prev;
  }

  get states():ArmedState[] {
    return this._statesArray;
  }

  constructor(o:ArmedStatesOptions) {
    super(_.clone(o, false, (o) => {
      o.id = 'ArmedStates';
    }));

    this._statesArray = o.armedStates;

    var order:number = 0;
    _.forEach(o.armedStates, (armedState) => {
      this._statesMap[armedState.id] = armedState;
      armedState.addParent(this);

    }, this);
  }

  toJson():any {
    var ret:any = super.toJson();
    ret['type'] = 'ArmedStates';
    ret['active'] = (this.active == null) ? null : this.active.id;
    ret['states'] = this._statesArray.map((e) => e.id);

    return ret;
  }

  activate(armedState:ArmedState):Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    if (this.active == armedState) {
      deferred.resolve(true);
    } else {
      armedState._activate()
        .then(() => {
          itemModule.transaction(() => {
            this._prev = this.active;

            if (this.active != null)
              this.active._deactivate();

            this._active = armedState;

            this.notifyChanged();

            this.active.notifyChanged();

            deferred.resolve(true);

          }, this);
        });
    }
    return deferred.promise;
  }

//TODO add eventLog
}



