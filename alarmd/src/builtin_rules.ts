///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import assert = require('assert')
import _ = require('lodash')

import U = require('./u')
import di = require('./domain_info')
import ruleEngineModule = require('./rule_engine')
import serviceModule = require('./service')
import itemModule = require('./item')
import arming = require('./arming')
import push_notification = require('./push_notification')

import logging = require('./logging');
var logger = new logging.Logger(__filename);


//---------------------------------------------------------------------------------------------------------------------
class Arm extends ruleEngineModule.Rule {
  prev:arming.ArmedState = di.service.armedStates.active;
  armedDetected:itemModule.Item[];

  run():void {
    this.prev = di.service.armedStates.active;
    this.armedDetected = _.filter(this.prev.allItems, (item) => item instanceof itemModule.Sensor && item.isDetected());
  }
}
ruleEngineModule.defineRule({ruleClass: Arm.prototype, depends: ['ArmedStates']});
//---------------------------------------------------------------------------------------------------------------------
class ArmHistory extends ruleEngineModule.Rule {

  armedState:arming.ArmedState = di.service.armedStates.active;
  prevDetected = {};
  arm:Arm = this.getRule(Arm.prototype);

  shouldRun():boolean {
    return super.shouldRun() && di.service.armedStates.active.timeLeft == 0;
  }

  run():void {
    var now = new Date();

    if (di.service.armedStates.active != this.armedState) {
      this.armedState = di.service.armedStates.active;
      this.prevDetected = {};
    }

    var updateEvent:boolean = false;
    _.forEach(this.arm.armedDetected, (item) => {
      if (this.armedState.bypassedItems[item.id])
        return;

      if (!this.armedState.triggeredItems[item.id]) {
        updateEvent = true;

        this.armedState.triggeredItems[item.id] = new arming.TriggeredItem(item);
        this.armedState.notifyChanged();

      } else if (!this.prevDetected[item.id]) {

        var t:arming.TriggeredItem = this.armedState.triggeredItems[item.id];

        if ((now.valueOf() - t.lastTriggered.valueOf()) / 1000 > 10)
          updateEvent = true;
        t.lastTriggered = now;
        ++t.count;
        this.armedState.notifyChanged();
      }
    }, this);

    if (updateEvent)
      this.armedState.updateLogEvent();

    this.prevDetected = {};
    _.forEach(this.arm.armedDetected, (e) => {
      this.prevDetected[e.id] = true;
    }, this);
  }
}
ruleEngineModule.defineRule({ruleClass: ArmHistory.prototype, depends: ['ArmedStates', 'Arm']});

//---------------------------------------------------------------------------------------------------------------------
class WouldTrigger extends ruleEngineModule.Rule {

  armedState:arming.ArmedState = di.service.armedStates.active;
  notified:{[key:string]:boolean} = {};
  arm:Arm = this.getRule(Arm.prototype);

  shouldRun():boolean {
    return super.shouldRun() && (
      di.service.armedStates.active.timeLeft > 0 ||
      di.service.armedStates.active != this.armedState) ||
      Object.keys(di.service.armedStates.active.wouldTriggerItems).length > 0;
  }

  run():void {
    if (di.service.armedStates.active != this.armedState) {
      this.armedState = di.service.armedStates.active;
      this.notified = {};
    }

    if (this.armedState.timeLeft == 0) {
      this.armedState.wouldTriggerItems = {};
      this.armedState.updateLogEvent();
    }

    var wouldTrigger:itemModule.Item[] = [];

    var updateEvent:boolean = false;

    _.forEach(this.arm.armedDetected, (item) => {
      if (this.armedState.bypassedItems[item.id])
        return;
      if (di.service.items.delayedArmed.at(item.id))
        return;

      if (!this.notified[item.id]) {
        this.notified[item.id] = true;
        wouldTrigger.push(item);
      }

      if (wouldTrigger.length == 0)
        return false;

      var now = new Date();
      _.forEach(wouldTrigger, (wtItem) => {
        var wouldTriggerItem:arming.WouldTriggerItem = this.armedState.wouldTriggerItems[wtItem.id];
        if (!wouldTriggerItem) {
          wouldTriggerItem = new arming.WouldTriggerItem(wtItem);
          this.armedState.wouldTriggerItems [wtItem.id] = wouldTriggerItem;
        }

        wouldTriggerItem.lastTriggered = now;
        ++wouldTriggerItem.count;
        updateEvent = true;

      }, this);

      if (updateEvent)
        this.armedState.updateLogEvent();

    }, this);
  }
}
ruleEngineModule.defineRule({ruleClass: WouldTrigger.prototype, depends: ['ArmedStates', 'Arm']});

//---------------------------------------------------------------------------------------------------------------------
class NotifyMonitor extends ruleEngineModule.Rule {

  prevDetectedString:string = '';

  shouldRun():boolean {
    return super.shouldRun() && !U.isNullOrUndefined(di.service.pushNotification);
  }

  run():void {
    var detected = _.filter(di.service.items.monitor.allItems, (item) => item instanceof itemModule.Sensor && item.isDetected());

    if (detected.length == 0)
      return;
    var detectedString = detected.map((item) => item.id).join(',');
    if (detectedString != this.prevDetectedString) {
      this.prevDetectedString = detectedString;
      di.service.pushNotification.send(new push_notification.Message({
        title: "Monitor Sensors Detected",
        body: detectedString,
        priority: push_notification.Priority.HIGH
      }));
    }
  }
}
ruleEngineModule.defineRule({ruleClass: NotifyMonitor.prototype, depends: ['monitor']});

//---------------------------------------------------------------------------------------------------------------------
class ActivateSiren extends ruleEngineModule.Rule {
  armedState:arming.ArmedState = di.service.armedStates.active;
  notified:{[key:string]:boolean} = {};
  arm:Arm = this.getRule(Arm.prototype);
  prevTimeLeftToNextState:number = 0;

  activateSiren():void {
    di.service.siren.activate();
    this.armedState.lastSiren = new Date();
    this.armedState.notifyChanged();
  }

  checkDispatchNotification():void {
    if (!di.service.siren.isActive())
      return;

    var toNotify = {};

    _.forEach(this.armedState.triggeredItems, (v, k)=> {
      if (this.notified[k])
        return;
      this.notified[k] = true;
      toNotify[k] = true;
    }, this);

    _.forEach(this.arm.armedDetected, (item)=> {
      if (this.armedState.bypassedItems[item.id])
        return;
      if (this.notified[item.id])
        return;
      this.notified[item.id] = true;
      toNotify[item.id] = true;
    }, this);

    if (Object.keys(toNotify).length > 0 && di.service.pushNotification != null) {
      //TODO change priority to CRITICAL (after debugging)
      di.service.pushNotification.send(new push_notification.Message({
        title: "Siren !!!",
        body: util.format("Sensors: %s", Object.keys(toNotify).join('\n')),
        priority: push_notification.Priority.HIGH
      }));
    }

  }

  run():void {
    if (di.service.armedStates.active != this.armedState) {
      this.armedState = di.service.armedStates.active;
      this.notified = {};
      this.prevTimeLeftToNextState = 0;
      di.service.siren.deactivate();
    }

    var timeLeftToNextState = di.service.siren.timeLeftToNextState;
    if (timeLeftToNextState > 0)
      this.prevTimeLeftToNextState = timeLeftToNextState;
    else if (this.prevTimeLeftToNextState > 0) {
      this.prevTimeLeftToNextState = 0;
      if (di.service.siren.isActive())
        di.service.siren.deactivate();
      else
        this.activateSiren();
      return;
    }

    this.checkDispatchNotification();

    if (di.service.siren.isActive())
      return;

    var delayedSensors = {};
    var nonDelayedSensors = {};

    if (this.armedState.timeLeft == 0) {
      var activate:boolean = false;
      var delayed:boolean = false;

      _.forEach(this.arm.armedDetected, (item) => {
        if (!this.armedState.bypassedItems[item.id]) {
          if (di.service.items.delayedSiren.containsItem(item))
            delayedSensors[item.id] = true;
          else
            nonDelayedSensors[item.id] = true;
        }
      }, this);

      if (Object.keys(nonDelayedSensors).length > 0 || Object.keys(delayedSensors).length > 0 && this.armedState.sirenDelay == 0) {
        logger.info("Activating Siren now. sensors: %s", _.union(Object.keys(nonDelayedSensors), Object.keys(delayedSensors)).join('\n'));
        this.activateSiren();
      }
      else if (Object.keys(delayedSensors).length > 0 && di.service.siren.timeLeftToNextState == 0) {
        logger.info("Activating Siren in %s, sensors: %s", this.armedState.sirenDelay, Object.keys(delayedSensors).join('\n'));
        di.service.siren.scheduleActivate(this.armedState.sirenDelay);
      }
    }
  }
}
ruleEngineModule.defineRule({ruleClass: ActivateSiren.prototype, depends: ['ArmedStates', 'Arm']});

//---------------------------------------------------------------------------------------------------------------------
class SensorHistory extends ruleEngineModule.Rule {
  prevDetected:{[key:string]: boolean} = {};

  run():void {
    var now = new Date();
    var slot = Math.floor(now.getTime() / 1000 / 300) * 300;

    var detected = _.filter(di.service.items.all.allItems, (item) => item instanceof itemModule.Sensor && item.isDetected());
    var oldPrevDetected = this.prevDetected;
    this.prevDetected = {};

    _.forEach(detected, (item) => {
      if (!oldPrevDetected[item.id]) {
        this.prevDetected[item.id] = true;
        di.service.sensorHistory.add(slot, item.id);
      }
    }, this);
  }
}
ruleEngineModule.defineRule({ruleClass: SensorHistory.prototype, depends: ['ArmedStates']});
