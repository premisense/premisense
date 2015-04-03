///<reference path="externals.d.ts"/>
import util = require('util');
import eventsModule = require('events')
import assert = require('assert')
import through = require('through')
import _ = require('lodash')
import mqtt = require('mqtt')

import U = require('./u')
import logging = require('./logging');
var logger = new logging.Logger(__filename);

import EventEmitter = eventsModule.EventEmitter

export class SyncPoint {
  private static _startTime:number = Date.now();
  private static _currentValue:number = 0;

  private _value:number;
  private static _zero:SyncPoint = SyncPoint.fromValue(0);

  public get value():number {
    return this._value;
  }

  public static get zero():SyncPoint {
    return SyncPoint._zero;
  }

  public static get currentValue():number {
    return SyncPoint._currentValue;
  }

  constructor() {
    this._value = SyncPoint._currentValue;
  }


  private static fromValue(value:number):SyncPoint {
    var syncPoint:SyncPoint = new SyncPoint();
    syncPoint.value = value;
    return syncPoint;
  }


  public static inc():SyncPoint {
    return SyncPoint.fromValue(++SyncPoint._currentValue);
  }

  sub(other:SyncPoint):number {
    return this.value - other.value;
  }

  compareTo(other:SyncPoint):number {
    return this.value - other.value;
  }

  format():string {
    return util.format("%d.%d", SyncPoint._startTime, this.value);
  }

  static parse(sinceString:string):SyncPoint {
    if (U.isNullOrUndefined(sinceString))
      return null;
    var sinceParts:string[] = sinceString.split('\.');
    if (sinceParts == null || sinceParts.length != 2) {
      throw new Error("invalid since format");
    }

    var startTime:number = parseInt(sinceParts[0]);
    if (startTime != SyncPoint._startTime)
      return null;

    return SyncPoint.fromValue(parseInt(sinceParts[1]));
  }
}

export class ItemEvent {
  _item:Item;
  _syncPoint:SyncPoint;
  _json:any;
  _originator:ItemEvent;

  get item():Item {
    return this._item;
  }

  get syncPoint():SyncPoint {
    return this._syncPoint;
  }

  get json():any {
    return this._json;
  }

  get originator():ItemEvent {
    return this._originator;
  }

  public constructor(item:Item, syncPoint:SyncPoint, json:any, originator ?:ItemEvent) {
    this._item = item;
    this._syncPoint = syncPoint;
    this._json = json;
    this._originator = !U.isNullOrUndefined(originator) ? originator : null;
  }

  source():ItemEvent {
    var s:ItemEvent = this;
    while (s.originator != null)
      s = s.originator;
    return s;
  }

  toString():string {
    return util.format("item:%s, sp:%d", this.item.id, this.syncPoint.value);
  }
}


class ItemTransaction {
  originator:ItemEvent;
  item:Item;

  constructor(item:Item, originator:ItemEvent) {
    this.item = item;
    this.originator = originator;
  }
}

class _GlobalTransaction {
  static current:_GlobalTransaction = new _GlobalTransaction();

  notify:{[key: string] : ItemTransaction} = {};

  startedTransactions:number = 0;
  completedTransactions:number = 0;

  constructor() {
  }

  insideTransaction():boolean {
    return this.startedTransactions > 0;
  }

  start() {
    assert (this.startedTransactions == 0 || this.startedTransactions > this.completedTransactions);

    ++this.startedTransactions;
  }

  notifyChanged(item:Item, originator:ItemEvent):boolean {
    if (this.startedTransactions === this.completedTransactions)
      return false;

    if (!this.notify[item.id])
      this.notify[item.id] = new ItemTransaction(item, originator);
    return true;
  }

  end() {
    if (++this.completedTransactions !== this.startedTransactions)
      return;
    var saveCompleted = this.completedTransactions;
    try {
      while (true) {
        var itemTransactions:ItemTransaction[] = _.values(this.notify);

        if (itemTransactions.length == 0)
          return;
        //if (itemTransactions.length > 1) {
        //  logger.info("Check sort");
        //}
        this.notify = {};

        _.forEach(itemTransactions, (itemTransaction) => {
          try {
            itemTransaction.item.notifyChanged(itemTransaction.originator);
          } catch (e) {
            logger.error(util.format("error during transaction notify change. error: %s. stack:%s", e.toString(), e.stack));
          }
        });
      }
    } finally {
      this.completedTransactions -= saveCompleted;
      this.startedTransactions -= saveCompleted;
    }
  }
}

export function transaction(t:()=>void, thisArg?:any):void {
  var cb = _.bind(t, thisArg);

  _GlobalTransaction.current.start();

  try {

    cb();

  }
  finally {
    _GlobalTransaction.current.end();
  }
}


export interface ItemOptions {
  id: string;
  name ?: string;
  groups ?: Group[];
  metadata ?: any;
  disabled ?: boolean;
  minor ?: boolean;
}

export class Item extends EventEmitter {
  private _syncPoint:SyncPoint = new SyncPoint();
  private _id:string;
  private _name:string;
  private _parentGroups:Group[] = [];

  get id():string {
    return this._id;
  }

  get name():string {
    return this._name;
  }

  metadata:any;
  private _disabled:boolean;
  private _eventInProgress:boolean = false;
  private _minor:boolean;

  private _syncPointNotifyChanged:SyncPoint = SyncPoint.zero;

  public get minor():boolean {
    return this._minor;
  }

  constructor(o:ItemOptions) {
    super();
    this._id = o.id;
    this._name = !U.isNullOrUndefined(o.name) ? o.name : o.id;
    this._disabled = !U.isNullOrUndefined(o.disabled) ? o.disabled === true : false;
    this._minor = !U.isNullOrUndefined(o.minor) ? o.minor === true : false;
    this.metadata = o.metadata || null;

    ItemEvents.instance.addItem(this);

    if (o.groups) {
      for (var i in o.groups) {
        var g = o.groups[i];
        this.addParent(g);
      }
    }

  }

  addParent(g:Group) {
    assert(this._parentGroups.indexOf(g) == -1);

    this._parentGroups.push(g);
    g.add(this);
  }

  forEachParentGroup(cb:(group:Group) => void, thisArg?:any) {
    if (this._parentGroups != null) {
      _.forEach(this._parentGroups, cb, thisArg);
    }
  }

  get syncPoint():SyncPoint {
    return this._syncPoint;
  }

  newEvent(originator ?:ItemEvent):ItemEvent {
    var itemEvent:ItemEvent = new ItemEvent(this, this._syncPoint, this.toJson(), originator);
    return itemEvent;
  }

  setNotify(item:Item, oldValue:any, newValue:any):any {
    if (oldValue == newValue)
      return oldValue;
    item.notifyChanged();
    return newValue;
  }

  onItemChanged(event:ItemEvent):void {
    logger.debug(util.format("item change event. item:%s: from:%s", this.id, event.item.id));
  }

  subscribe(toItem:Item):void {
    var self = this;
    toItem.on("event", (e) => {
      self.onItemChanged (e);
    });
  }

  _notifyChangeParents(event:ItemEvent) {
    this.forEachParentGroup((group) => group.notifyChanged(event));
  }

  notifyChanged(originator ?:ItemEvent):void {
    U.assertDebugger(_GlobalTransaction.current.insideTransaction());

    if (this._syncPointNotifyChanged > this._syncPoint)
      return;

    if (_GlobalTransaction.current.notifyChanged(this, originator))
      return;

    this._syncPointNotifyChanged = this._syncPoint;
    this._syncPoint = SyncPoint.inc();
    var event:ItemEvent = this.newEvent(originator);

    //ensure that we are still the latest
    assert(this._syncPoint.value === SyncPoint.currentValue);

    ItemEvents.instance.handleEvent(event);
    this.emit("event", event);
    this._notifyChangeParents(event);
  }

  isChanged(from:SyncPoint, to:SyncPoint):boolean {
    if (from != null && from.value > this._syncPoint.value)
      return false;
    if (to != null && to.value < this._syncPoint.value)
      return false;
    return true;
  }

  toJson():any {
    var ret:any = {
      'type': 'Item',
      'id': this.id,
      'name': this._name,
      'metadata': this.metadata,
      'disabled': this._disabled,
      'syncValue': this.syncPoint.format()
    };
    return ret;
  }

}

export class Nop extends Item {
  private static _instance:Nop = null;

  static get instance():Nop {
    if (Nop._instance == null) {
      Nop._instance = new Nop();
    }
    return Nop._instance;
  }

  constructor() {
    super({id: 'NOP', name: 'NOP'});
  }

  toJson():any {
    var ret:any = super.toJson();
    ret['type'] = 'NOP';
    ret['syncValue'] = new SyncPoint().format();
    return ret;
  }

}


export class Group extends Item {
  _childItems:{[key: string]: Item} = {};
  _childGroups:{[key: string]: Group} = {};
  _allItems:{[key: string]: Item} = {};

  constructor(o:ItemOptions) {
    super(_.clone(o, false, (o) => {
      o.minor = true;
    }));
  }

  get allItems():{[key: string]: Item} {
    return this._allItems;
  }

  at(id:string):Item {
    return this._allItems[id];
  }

  forEachChildItem(cb:(item:Item) => void, thisArg?:any):void {
    if (this._childItems != null) {
      _.forEach(this._childItems, cb, thisArg);
    }
  }

  forEachChildGroup(cb:(group:Group) => void, thisArg?:any) {
    if (this._childGroups != null) {
      _.forEach(this._childGroups, cb, thisArg);
    }
  }

  forEachItem(cb:(item:Item) => void, thisArg?:any) {
    if (this._allItems != null) {
      _.forEach(this._allItems, cb, thisArg);
    }
  }

  _addItem(item:Item):void {
    assert(item != this);

    var i:Item = this._allItems[item.id];
    assert(_.isUndefined(i) || i == item);

    if (i == item)
      return;

    this._allItems[item.id] = item;

    if (item instanceof Group) {
      item.forEachItem((groupItem) => {
        this._addItem(groupItem);
      }, this);
    }

    this.forEachParentGroup((group:Group) => {
      group.itemAdded(this, item);
    }, this);
  }

  containsChild(item:Item):boolean {
    if (this._childItems[item.id])
      return true;
    return false;
  }

  containsItem(item:Item):boolean {
    if (this._allItems[item.id])
      return true;
    return false;
  }

  itemAdded(childGroup:Group, item:Item):void {
    this._addItem(item);
  }

  add(item:Item):void {
    assert(!this._childItems[item.id]);

    this._childItems[item.id] = item;
    if (item instanceof Group)
      this._childGroups[item.id] = item;

    this._addItem(item);
    this.subscribe(item);

    this.notifyChanged();
  }


  toJson():any {
    var ret:any = super.toJson();
    ret['type'] = 'Group';
    ret['detected'] = _.filter(this._allItems, (e) => e instanceof Sensor && e.isDetected()).map((e) => e.id);
    return ret;
  }

}

export interface SensorOptions extends ItemOptions {
  gpioId ?: number;
}


export class Sensor extends Item {
  private _state:any;
  private _gpioId:number;

  constructor(o:SensorOptions) {
    super(o);
    this._gpioId = o.gpioId;
  }

  get gpioId():number {
    return this._gpioId;
  }

  get state():any {
    return this._state;
  }

  set state(state:any) {

    if (this._state === state)
      return;
    this._state = state;
    this.notifyChanged();
  }

  formatState():string {
    throw new Error("not implemented");
  }

  isDetected():boolean {
    throw new Error("not implemented");
  }

  toJson():any {
    var ret:any = super.toJson();
    ret['type'] = 'Sensor';
    ret['state'] = this.formatState();
    ret['detected'] = this.isDetected();

    return ret;
  }
}

export class BooleanSensor extends Sensor {

  constructor(o:SensorOptions) {
    super(o);
    this.state = false;
  }

  formatState():string {
    return this.state.toString();
  }

  isDetected():boolean {
    return this.state === true;
  }
}

export class NumericSensor extends Sensor {

  constructor(o:SensorOptions) {
    super(o);
    this.state = 0;
  }


  formatState():string {
    return this.state.toString();
  }

  isDetected():boolean {
    if (this.state == null)
      return false;
    var i:number = this.state;
    return i > 0;
  }
}

export class ArduinoSensor extends NumericSensor {

  constructor(o:SensorOptions) {
    super(o);
  }
}

export class ArduinoInputPullupSensor extends ArduinoSensor {

  constructor(o:SensorOptions) {
    super(o);
  }

  isDetected():boolean {
    if (this.state == null)
      return false;

    if (this.state.toString() == '1') {
      return true;
    }
    return false;
  }

  formatState():string {
    return this.isDetected() ? "ON" : "OFF";
  }
}

export class ArduinoInputAnalogSensor extends ArduinoSensor {

  constructor(o:SensorOptions) {
    super(o);
  }


  isDetected():boolean {
    var value:number = parseInt(this.formatState());
    if (this.state == null && value > 400) {
      return false;
    }
    return true;
  }

  formatState():string {
    return this.isDetected() ? "ON" : "OFF";
  }
}

export interface SirenOptions extends ItemOptions {
  maxActiveTime?:number;
  mqttClient:mqtt.Client;
  topic:string;
  activateCommand:string;
  deactivateCommand:string;
}

export class Siren extends Item {
  private _active:boolean = false;
  private _lastActive:Date = null;
  private _timeLeftToNextState:number = 0;
  private _nextStateTime:Date = null;
  private mqttClient : mqtt.Client;
  private _maxActiveTime:number;
  private _topic:string;
  private _activateCommand:string;
  private _deactivateCommand:string;

  isActive():boolean {
    return this._active;
  }

  get timeLeftToNextState():number {
    if (this._nextStateTime == null)
      return 0;
    var left:number = Math.floor((this._nextStateTime.valueOf() - Date.now()) / 1000);
    return (left < 0) ? 0 : left;
  }

  get nextStateTime():Date {
    return this._nextStateTime;
  }


  _checkNotifyChangedTimeLeft():void {
    if (this.timeLeftToNextState > 0) {
      setTimeout(() => {
        transaction(() => {
          this.notifyChanged();
        }, this);
        this._checkNotifyChangedTimeLeft();
      }, 500);
    }
  }

  constructor(o:SirenOptions) {
    super(o);
    this._maxActiveTime = !U.isNullOrUndefined(o.maxActiveTime) ? o.maxActiveTime : 10 * 60;
    this.mqttClient = o.mqttClient;
    this._topic = o.topic;
    this._activateCommand = o.activateCommand;
    this._deactivateCommand = o.deactivateCommand;
  }

  get active():boolean {
    return this._active;
  }

  get lastActive():Date {
    return this._lastActive;
  }


  toJson():any {
    var ret:any = super.toJson();
    ret['type'] = 'Siren';
    ret['active'] = this.active;
    ret['lastActive'] = (this.lastActive == null) ? null : Math.floor(this.lastActive.valueOf() / 1000);
    ret['timeLeft'] = this.timeLeftToNextState;
    ret['nextStateTime'] = (this._nextStateTime == null) ? null : Math.floor(this._nextStateTime.valueOf() / 1000);
    return ret;
  }

  _setActive(active:boolean, newTimeLeftToNextState:number):void {
    if (this._active == active && this._timeLeftToNextState == newTimeLeftToNextState)
      return;

    transaction(() => {
      logger.debug("siren._setActive(active:%s, timeLeftToNextState: %s)", active, newTimeLeftToNextState);

      var now:Date = new Date();
      if (!this._active && active)
        this._lastActive = now;
      this._timeLeftToNextState = newTimeLeftToNextState;

      if (this._active != active && !U.isNullOrUndefined(this.mqttClient) && !U.isNullOrUndefined(this._topic) && this._topic.length > 0) {
        if (active) {
          if (!U.isNullOrUndefined(this._activateCommand) && this._activateCommand.length > 0) {
            this.mqttClient.publish(this._topic, this._activateCommand);
          }
        } else if (!U.isNullOrUndefined(this._deactivateCommand) && this._deactivateCommand.length > 0) {
          this.mqttClient.publish(this._topic, this._deactivateCommand);
        }
      }

      this._active = active;
      if (this._timeLeftToNextState == 0)
        this._nextStateTime = null;
      else
        this._nextStateTime = new Date(Date.now() + 1000 * this._timeLeftToNextState);

      this._checkNotifyChangedTimeLeft();

      this.notifyChanged();
    }, this);
  }

  deactivate():void {
    this._setActive(false, 0);
  }

  activate():void {
    this._setActive(true, this._maxActiveTime);
  }

  scheduleActivate(newTimeLeftToNextState:number):void {
    if (this._active)
      return;
    this._setActive(false, newTimeLeftToNextState);
  }
}

export class ItemEvents {
  private static _instance:ItemEvents = new ItemEvents ();

  static get instance():ItemEvents {
    return ItemEvents._instance;
  }

  private ring:ItemEvent[] = [];
  private _lastReceived:SyncPoint = SyncPoint.zero;
  private _items:{[key:string]:Item} = {};
  //private _items:Item[];
  private ringSize:number = 1000;
  private activeStreams:through.ThroughStream[] = [];

  constructor() {
  }

  addItem(item:Item) : void {
    this._items[item.id] = item;
  }

  private findEvent(syncPoint:SyncPoint):number {

    var minIndex:number = 0;
    var maxIndex:number = this.ring.length - 1;
    var currentIndex;
    var currentElement;

    while (minIndex <= maxIndex) {
      currentIndex = (minIndex + maxIndex) / 2 | 0;
      currentElement = this.ring[currentIndex];

      var cmp:number = currentElement.syncPoint.compareTo(syncPoint);

      if (cmp < 0) {
        minIndex = currentIndex + 1;
      }
      else if (cmp > 0) {
        maxIndex = currentIndex - 1;
      }
      else {
        return currentIndex;
      }
    }

    return -1;
  }

  handleEvent(event:ItemEvent):void {
    assert(event != null);

    // we ignore duplicate events
    if (this.findEvent(event.syncPoint) >= 0)
      return;

    // to ensure we handle events in order, we recurse first
    if (event.originator != null)
      this.handleEvent(event.originator);

    logger.debug("checking event. ", event.item.id);

    U.assertDebugger(this._lastReceived.value == 0 || this._lastReceived.value + 1 == event.syncPoint.value);

    logger.debug(util.format("handling event. %s", event.toString()));

    this._lastReceived = event.syncPoint;

    this.ring.push(event);

    while (this.ring.length > this.ringSize)
      this.ring.shift();

    _.forEach(this.activeStreams, (e) => {
      e.push(event);
    });
  }

  snapshotEvents():ItemEvent[] {
    var collected:{[key:string]: ItemEvent} = {};

    _.forEach(this._items, (item) => {
      collected[item.id] = item.newEvent();

      if (item instanceof Group) {
        var group:Group = item;
        group.forEachItem((item:Item) => {
          collected[item.id] = item.newEvent();
        });
      }
    });

    var events:ItemEvent[] = _.values(collected);
    events.sort((a, b) => {
      return a.syncPoint.compareTo(b.syncPoint);
    });

    return events;
  }

  stream(since?:SyncPoint):through.ThroughStream {
    var strm:through.ThroughStream = through();
    strm.pause();

    strm.on('end', () => {
      this.activeStreams.filter((e) => {
        return (e != strm);
      });
    });

    var sincePos:number = (since == null) ? -1 : this.findEvent(since);


    if (sincePos == -1) {
      var snapshot = this.snapshotEvents();
      _.forEach(snapshot, (e) => {
        strm.push(e);
      });
    } else {
      for (var i:number = sincePos + 1; i < this.ring.length; ++i) {
        var itemEvent:ItemEvent = this.ring[i];
        strm.push(itemEvent);
      }
    }

    this.activeStreams.push(strm);

    return strm;
  }
}
