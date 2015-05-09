///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import Q = require('q')
import assert = require('assert')
import _ = require('lodash')

import U = require('./u')
import itemModule = require('./item')
import di = require('./domain_info')
import service = require('./service')
import logging = require('./logging');
var logger = new logging.Logger(__filename);

declare var require;

export interface RuleDefinitionOptions {
  ruleClass:any;
  depends?:string[];
  disabled?:boolean;
}

class RuleDefinition {
  options:RuleDefinitionOptions;
  overridden:boolean = false;
  overriddenBy:RuleDefinition;
  superRuleDefinition:RuleDefinition;
  depends:{[key:string]:boolean} = {};
  baseClasses:string[] = [];
  rule:Rule;


  constructor(options:RuleDefinitionOptions) {
    this.options = options;
  }

  get className():string {
    return this.options.ruleClass.constructor['name'];
  }

  isSubclassOf(className:string):boolean {
    return this.baseClasses.indexOf(className) >= 0;
  }
}

// the below is to allow self construction of rules (only during RuleEngine init)
var _currentRuleDefinition:RuleDefinition = null;

export interface RuleOptions extends itemModule.ItemOptions {

}

export class Rule extends itemModule.Item {
  _ruleDefinition:RuleDefinition;

  get ruleDefinitionOptions():RuleDefinitionOptions {
    return this._ruleDefinition.options;
  }

  private static createOptions():RuleOptions {
    return {
      id: _currentRuleDefinition.className,
      name: _currentRuleDefinition.className
    }
  }

  constructor() {
    super(Rule.createOptions());
    //super({id: _currentRuleDefinition.id, name: _currentRuleDefinition.name});
    this._ruleDefinition = _currentRuleDefinition;
  }

  getRule<T>(t:T):T {
    return di.service.ruleEngine.getRule(t);
  }

  toJson():any {
    var ret:any = super.toJson();

    ret['type'] = 'Rule';

    return ret;
  }

  shouldRun():boolean {
    return true;
  }

  _run():void {
    logger.debug(util.format("checking if rule %s should run", this.id));
    if (!this.shouldRun())
      return;

    logger.debug("running rule %s", this.id);
    itemModule.transaction(() => {

      try {
        this.run();
      } catch (e) {
        logger.error("exception thrown from rule: %s. error:%s. stack:%s", this.id, e, e.stack);
      }

      // instead of tracking changes, to simplify. rules always notify their listeners when they run
      this.notifyChanged();
    }, this);

  }

  onItemChanged(itemEvent:itemModule.ItemEvent):void {
    super.onItemChanged(itemEvent);

    // to avoid starting a new transaction inside the notifier's transaction we reschedule a new one
    this.reschedule(0);
    //this._run();
  }

  reschedule(ms:number):Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var self = this;

    Q.delay(ms)
      .then(() => {
        self._run();
        deferred.resolve(true);
      });
    deferred.resolve(true);
    return deferred.promise;

  }

  start():any {

  }

  run():void {
    throw new Error("not implemented");

  }
}

export class RuleEngine extends itemModule.Group {
  static _current:RuleEngine = null;

  private collectedRules:{[key:string]: RuleDefinition} = {};
  _items:service.SystemItems;
  _rules:Rule[];

  get rules():Rule[] {
    return this._rules;
  }


  constructor(items:service.SystemItems) {
    super({id: 'RuleEngine', name: 'RuleEngine', groups: [items.all]});
    this._items = items;

  }


  toJson():any {
    var ret:any = super.toJson();

    ret['type'] = 'RuleEngine';

    return ret;
  }

  getRule<T>(t:T):any {
    var result = _.find(this.collectedRules, (rd) => {
      return rd.options.ruleClass == t;
    });

    if (result)
      return result.rule;
    throw new Error(util.format("could not find rule: %s", t));
  }

  private startRule(r:Rule):Q.Promise<boolean> {
    logger.info(util.format("starting rule %s", r.name));

    var f = r.start();
    if (f instanceof Q.Promise)
      return f;

    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();
    deferred.resolve(true);
    return deferred.promise;

  }

  loadModule(name:string):void {
    logger.debug("loading rules module: " + name);

    var prev:RuleEngine = RuleEngine._current;
    try {
      RuleEngine._current = this;

      var m = require(name);
      logger.debug("rules module: " + name + " loaded successfully");

    } finally {
      RuleEngine._current = prev;
    }
  }

  defineRule(options:RuleDefinitionOptions) {
    var ruleDefinition:RuleDefinition = new RuleDefinition(options);

    assert(ruleDefinition.className !== 'Rule');

    if (!_.isObject(options.ruleClass)) {
      throw new Error(util.format("rule %s is not derived from RuleEngine.Rule", ruleDefinition.className));
    }

    if (!options.ruleClass.constructor.name) {
      throw new Error(util.format("rule %s does not have a default constructor", ruleDefinition.className));
    }

    var baseClasses:string[] = [];

    var _addBaseClasses = (p:any):void => {
      if (!_.isObject(p) || _.isUndefined(p)) {
        throw new Error(util.format("rule %s is not derived from RuleEngine.Rule", ruleDefinition.className));
      }

      var name = p.constructor.name;

      if (_.isUndefined(name)) {
        throw new Error(util.format("rule %s does not have a default constructor", ruleDefinition.className));
      }

      baseClasses.push(name);

      if (name === 'Rule')
        return;
      _addBaseClasses(p.__proto__);
    };

    _addBaseClasses(options.ruleClass.__proto__);

    ruleDefinition.baseClasses = baseClasses;

    assert(!this.collectedRules[ruleDefinition.className]);
    this.collectedRules[ruleDefinition.className] = ruleDefinition;
  }

  private initRules():void {

    var collectedRules = this.collectedRules;

    // mark overridden classes
    _.forEach(collectedRules, (rule) => {
      rule.overridden = _.any(collectedRules, (other) => {
        return rule != other && other.isSubclassOf(rule.className);
      });
    });

    _.forEach(collectedRules, (rule) => {
      if (!rule.overridden)
        return;

      if (_.filter(collectedRules, (other) => {
          return !other.options.disabled && !other.overridden && other.isSubclassOf(rule.className);
        }).length !== 1)
        throw new Error(util.format("there cannot be more than one subclass of : %s", rule.className));

      rule.overriddenBy = _.find(collectedRules, (other) => {
        return !other.options.disabled && !other.overridden && other.isSubclassOf(rule.className);
      });
    });

    // set superRuleDefinition
    _.forEach(collectedRules, (rule) => {
      var superRuleName = _.find(rule.baseClasses, (baseClass) => {
        return !_.isUndefined(collectedRules[baseClass]);
      });
      if (superRuleName) {
        rule.superRuleDefinition = collectedRules[superRuleName];
      } else {
        rule.superRuleDefinition = null;
      }
    });


    // now, collect items from superclasses and resolve their name from derived rules if possible
    _.forEach(collectedRules, (rule) => {
      _.forEach(rule.options.depends, (depend) => {
        var dependOnRule:RuleDefinition = collectedRules [depend];

        var resolvedDepend = depend;
        if (dependOnRule) {
          if (dependOnRule.overridden)
            resolvedDepend = dependOnRule.className;
          else
            resolvedDepend = dependOnRule.className;
        }

        if (rule.overridden)
          rule.overriddenBy.depends[resolvedDepend] = true;
        else
          rule.depends[resolvedDepend] = true;
      });
    });

    var finalRuleDefinitions:RuleDefinition[] = _.filter(collectedRules, (rule) => {
      return !rule.options.disabled && !rule.overridden;
    });

    this._rules = [];

    _.forEach(finalRuleDefinitions, (rd) => {
      logger.info("creating rule object: %s ", rd.className);

      rd.rule = Object.create(rd.options.ruleClass);

      this._rules.push(rd.rule);

    });

    _currentRuleDefinition = null;
    try {
      _.forEach(finalRuleDefinitions, (rd) => {
        logger.info("constructing rule: %s ", rd.className);

        //for self construction (see on top)
        _currentRuleDefinition = rd;

        rd.rule.constructor();
        itemModule.transaction(() => {
          rd.rule.addParent(this);
        });

      });
    } finally {
      _currentRuleDefinition = null;
    }

    // now, finally, we can subscribe to items (depends)
    _.forEach(this._rules, (rule) => {
      _.forEach(rule._ruleDefinition.depends, (dummy, depend) => {
        var item:itemModule.Item = this._items.all.at(depend);
        if (!item)
          throw new Error(util.format("cannot resolve dependency: %s for rule: %s", depend, rule._ruleDefinition.className));
        rule.subscribe(item);
      });
    });
  }

  start():Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    var self = this;

    this.initRules();

    var startRules:Q.Promise<boolean>[] = [];

    logger.debug("starting all rules");

    _.forEach(this._rules, (rule) => {
      startRules.push(this.startRule(rule));
    }, this);

    Q.allSettled(startRules)
      .then(() => {
        logger.debug("all rules started");

        deferred.resolve(true);
      });

    return deferred.promise;
  }

  run():void {
    logger.debug("let each rule first chance to run");
    _.forEach(this._rules, (rule) => {
      rule._run();
    });
  }

}

export function defineRule(options:RuleDefinitionOptions) {
  var ruleEngine:RuleEngine = RuleEngine._current;
  assert(ruleEngine != null);
  ruleEngine.defineRule(options);
}
