var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
///<reference path="externals.d.ts"/>
var util = require('util');
var Q = require('q');
var assert = require('assert');
var _ = require('lodash');
var itemModule = require('./item');
var di = require('./domain_info');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var RuleDefinition = (function () {
    function RuleDefinition(options) {
        this.overridden = false;
        this.depends = {};
        this.baseClasses = [];
        this.options = options;
    }
    Object.defineProperty(RuleDefinition.prototype, "className", {
        get: function () {
            return this.options.ruleClass.constructor['name'];
        },
        enumerable: true,
        configurable: true
    });
    RuleDefinition.prototype.isSubclassOf = function (className) {
        return this.baseClasses.indexOf(className) >= 0;
    };
    return RuleDefinition;
})();
// the below is to allow self construction of rules (only during RuleEngine init)
var _currentRuleDefinition = null;
var Rule = (function (_super) {
    __extends(Rule, _super);
    function Rule() {
        _super.call(this, Rule.createOptions());
        //super({id: _currentRuleDefinition.id, name: _currentRuleDefinition.name});
        this._ruleDefinition = _currentRuleDefinition;
    }
    Object.defineProperty(Rule.prototype, "ruleDefinitionOptions", {
        get: function () {
            return this._ruleDefinition.options;
        },
        enumerable: true,
        configurable: true
    });
    Rule.createOptions = function () {
        return {
            id: _currentRuleDefinition.className,
            name: _currentRuleDefinition.className
        };
    };
    Rule.prototype.getRule = function (t) {
        return di.service.ruleEngine.getRule(t);
    };
    Rule.prototype.toJson = function () {
        var ret = _super.prototype.toJson.call(this);
        ret['type'] = 'Rule';
        return ret;
    };
    Rule.prototype.shouldRun = function () {
        return true;
    };
    Rule.prototype._run = function () {
        var _this = this;
        logger.debug(util.format("checking if rule %s should run", this.id));
        if (!this.shouldRun())
            return;
        logger.debug("running rule %s", this.id);
        itemModule.transaction(function () {
            try {
                _this.run();
            }
            catch (e) {
                logger.error("exception thrown from rule: %s. error:%s. stack:%s", _this.id, e, e.stack);
            }
            // instead of tracking changes, to simplify. rules always notify their listeners when they run
            _this.notifyChanged();
        }, this);
    };
    Rule.prototype.onItemChanged = function (itemEvent) {
        _super.prototype.onItemChanged.call(this, itemEvent);
        // to avoid starting a new transaction inside the notifier's transaction we reschedule a new one
        this.reschedule(0);
        //this._run();
    };
    Rule.prototype.reschedule = function (ms) {
        var deferred = Q.defer();
        var self = this;
        Q.delay(ms)
            .then(function () {
            self._run();
            deferred.resolve(true);
        });
        deferred.resolve(true);
        return deferred.promise;
    };
    Rule.prototype.start = function () {
    };
    Rule.prototype.run = function () {
        throw new Error("not implemented");
    };
    return Rule;
})(itemModule.Item);
exports.Rule = Rule;
var RuleEngine = (function (_super) {
    __extends(RuleEngine, _super);
    function RuleEngine(items) {
        _super.call(this, { id: 'RuleEngine', name: 'RuleEngine', groups: [items.all] });
        this.collectedRules = {};
        this._items = items;
    }
    Object.defineProperty(RuleEngine.prototype, "rules", {
        get: function () {
            return this._rules;
        },
        enumerable: true,
        configurable: true
    });
    RuleEngine.prototype.toJson = function () {
        var ret = _super.prototype.toJson.call(this);
        ret['type'] = 'RuleEngine';
        return ret;
    };
    RuleEngine.prototype.getRule = function (t) {
        var result = _.find(this.collectedRules, function (rd) {
            return rd.options.ruleClass == t;
        });
        if (result)
            return result.rule;
        throw new Error(util.format("could not find rule: %s", t));
    };
    RuleEngine.prototype.startRule = function (r) {
        logger.info(util.format("starting rule %s", r.name));
        var f = r.start();
        if (f instanceof Q.Promise)
            return f;
        var deferred = Q.defer();
        deferred.resolve(true);
        return deferred.promise;
    };
    RuleEngine.prototype.loadModule = function (name) {
        logger.debug("loading rules module: " + name);
        var prev = RuleEngine._current;
        try {
            RuleEngine._current = this;
            var m = require(name);
            logger.debug("rules module: " + name + " loaded successfully");
        }
        finally {
            RuleEngine._current = prev;
        }
    };
    RuleEngine.prototype.defineRule = function (options) {
        var ruleDefinition = new RuleDefinition(options);
        assert(ruleDefinition.className !== 'Rule');
        if (!_.isObject(options.ruleClass)) {
            throw new Error(util.format("rule %s is not derived from RuleEngine.Rule", ruleDefinition.className));
        }
        if (!options.ruleClass.constructor.name) {
            throw new Error(util.format("rule %s does not have a default constructor", ruleDefinition.className));
        }
        var baseClasses = [];
        var _addBaseClasses = function (p) {
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
    };
    RuleEngine.prototype.initRules = function () {
        var _this = this;
        var collectedRules = this.collectedRules;
        // mark overridden classes
        _.forEach(collectedRules, function (rule) {
            rule.overridden = _.any(collectedRules, function (other) {
                return rule != other && other.isSubclassOf(rule.className);
            });
        });
        _.forEach(collectedRules, function (rule) {
            if (!rule.overridden)
                return;
            if (_.filter(collectedRules, function (other) {
                return !other.options.disabled && !other.overridden && other.isSubclassOf(rule.className);
            }).length !== 1)
                throw new Error(util.format("there cannot be more than one subclass of : %s", rule.className));
            rule.overriddenBy = _.find(collectedRules, function (other) {
                return !other.options.disabled && !other.overridden && other.isSubclassOf(rule.className);
            });
        });
        // set superRuleDefinition
        _.forEach(collectedRules, function (rule) {
            var superRuleName = _.find(rule.baseClasses, function (baseClass) {
                return !_.isUndefined(collectedRules[baseClass]);
            });
            if (superRuleName) {
                rule.superRuleDefinition = collectedRules[superRuleName];
            }
            else {
                rule.superRuleDefinition = null;
            }
        });
        // now, collect items from superclasses and resolve their name from derived rules if possible
        _.forEach(collectedRules, function (rule) {
            _.forEach(rule.options.depends, function (depend) {
                var dependOnRule = collectedRules[depend];
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
        var finalRuleDefinitions = _.filter(collectedRules, function (rule) {
            return !rule.options.disabled && !rule.overridden;
        });
        this._rules = [];
        _.forEach(finalRuleDefinitions, function (rd) {
            logger.info("creating rule object: %s ", rd.className);
            rd.rule = Object.create(rd.options.ruleClass);
            _this._rules.push(rd.rule);
        });
        _currentRuleDefinition = null;
        try {
            _.forEach(finalRuleDefinitions, function (rd) {
                logger.info("constructing rule: %s ", rd.className);
                //for self construction (see on top)
                _currentRuleDefinition = rd;
                rd.rule.constructor();
                itemModule.transaction(function () {
                    rd.rule.addParent(_this);
                });
            });
        }
        finally {
            _currentRuleDefinition = null;
        }
        // now, finally, we can subscribe to items (depends)
        _.forEach(this._rules, function (rule) {
            _.forEach(rule._ruleDefinition.depends, function (dummy, depend) {
                var item = _this._items.all.at(depend);
                if (!item)
                    throw new Error(util.format("cannot resolve dependency: %s for rule: %s", depend, rule._ruleDefinition.className));
                rule.subscribe(item);
            });
        });
    };
    RuleEngine.prototype.start = function () {
        var _this = this;
        var deferred = Q.defer();
        var self = this;
        this.initRules();
        var startRules = [];
        logger.debug("starting all rules");
        _.forEach(this._rules, function (rule) {
            startRules.push(_this.startRule(rule));
        }, this);
        Q.allSettled(startRules)
            .then(function () {
            logger.debug("all rules started");
            deferred.resolve(true);
        });
        return deferred.promise;
    };
    RuleEngine.prototype.run = function () {
        logger.debug("let each rule first chance to run");
        _.forEach(this._rules, function (rule) {
            rule._run();
        });
    };
    RuleEngine._current = null;
    return RuleEngine;
})(itemModule.Group);
exports.RuleEngine = RuleEngine;
function defineRule(options) {
    var ruleEngine = RuleEngine._current;
    assert(ruleEngine != null);
    ruleEngine.defineRule(options);
}
exports.defineRule = defineRule;
//# sourceMappingURL=rule_engine.js.map