var domain = require('domain');
var U = require('./u');
var serviceModule = require('./service');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var DomainInfo = (function () {
    function DomainInfo() {
        this._user = null;
    }
    Object.defineProperty(DomainInfo, "global", {
        get: function () {
            return DomainInfo._global;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(DomainInfo, "active", {
        get: function () {
            var dom = domain;
            if (U.isNullOrUndefined(dom.active) || U.isNullOrUndefined(dom.active.domainInfo)) {
                return DomainInfo._global;
            }
            else {
                return dom.active.domainInfo;
            }
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
                return serviceModule.Service.instance.users.getAnonymous();
            }
        },
        set: function (u) {
            this._user = u;
        },
        enumerable: true,
        configurable: true
    });
    DomainInfo._global = new DomainInfo();
    return DomainInfo;
})();
exports.DomainInfo = DomainInfo;
//# sourceMappingURL=domain_info.js.map