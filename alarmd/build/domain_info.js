"use strict";
var assert = require('assert');
var _ = require('lodash');
var domainModule = require('domain');
//from 'domain' import {DomainInfo};
var U = require('./u');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var DomainInfo = (function () {
    function DomainInfo(parent) {
        this._user = null;
        this._parent = parent;
        this._domain = domainModule.create();
        this._domain.on('error', function (err) {
            logger.error("domain error: %s. stack:%s", err, err.stack);
        });
        var dom = this._domain;
        dom.domainInfo = this;
    }
    Object.defineProperty(DomainInfo.prototype, "domain", {
        get: function () {
            return this._domain;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DomainInfo, "active", {
        get: function () {
            var dom = domainModule;
            assert(!U.isNullOrUndefined(dom.active) || !U.isNullOrUndefined(dom.active.domainInfo));
            return dom.active.domainInfo;
        },
        enumerable: true,
        configurable: true
    });
    DomainInfo.create = function (parent) {
        return new DomainInfo(parent);
    };
    Object.defineProperty(DomainInfo.prototype, "parent", {
        get: function () {
            return this._parent;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DomainInfo.prototype, "user", {
        get: function () {
            if (!U.isNullOrUndefined(this._user)) {
                return this._user;
            }
            else {
                return this.service.users.getAnonymous();
            }
        },
        set: function (u) {
            this._user = u;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DomainInfo, "user", {
        get: function () {
            return DomainInfo.active.user;
        },
        set: function (_user) {
            DomainInfo.active.user = _user;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DomainInfo, "service", {
        //------------------------------------------------------------------------------------------
        get: function () {
            return DomainInfo.active.service;
        },
        set: function (_service) {
            DomainInfo.active.service = _service;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DomainInfo.prototype, "service", {
        get: function () {
            if (_.isUndefined(this._service) && !U.isNullOrUndefined(this._parent)) {
                return this._parent.service;
            }
            return this._service;
        },
        set: function (_service) {
            this._service = _service;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DomainInfo, "itemEvents", {
        //------------------------------------------------------------------------------------------
        get: function () {
            return DomainInfo.active.itemEvents;
        },
        set: function (_itemEvents) {
            DomainInfo.active.itemEvents = _itemEvents;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DomainInfo.prototype, "itemEvents", {
        get: function () {
            if (_.isUndefined(this._itemEvents) && !U.isNullOrUndefined(this._parent)) {
                return this._parent.itemEvents;
            }
            return this._itemEvents;
        },
        set: function (_itemEvents) {
            this._itemEvents = _itemEvents;
        },
        enumerable: true,
        configurable: true
    });
    return DomainInfo;
}());
module.exports = DomainInfo;
//# sourceMappingURL=domain_info.js.map