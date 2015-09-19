var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
///<reference path="externals.d.ts"/>
var util = require('util');
var assert = require('assert');
var _ = require('lodash');
var U = require('./u');
var itemModule = require('./item');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var UserSession = (function (_super) {
    __extends(UserSession, _super);
    function UserSession(o) {
        _super.call(this, o);
    }
    UserSession.prototype.toJson = function () {
        var ret = _super.prototype.toJson.call(this);
        ret['type'] = 'UserSession';
        return ret;
    };
    return UserSession;
})(itemModule.NumericSensor);
exports.UserSession = UserSession;
var User = (function (_super) {
    __extends(User, _super);
    function User(o) {
        _super.call(this, _.clone(o, false, function (o) {
            o.minor = true;
            o.name = o.id;
            o.id = "user:" + o.id;
        }));
        this.password = o.password;
        this.accessRestApi = o.accessRestApi;
        this.pinCode = o.pinCode;
        this.forcePinCode = o.forcePinCode;
        this._kioskSensor = new UserSession({ id: User.formatItemId(this.id, "kiosk"), groups: [this], minor: true });
        this._loginSensor = new UserSession({ id: User.formatItemId(this.id, "login"), groups: [this], minor: true });
    }
    Object.defineProperty(User, "ADMIN", {
        get: function () {
            return "admin";
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(User, "ANONYMOUS", {
        get: function () {
            return "anonymous";
        },
        enumerable: true,
        configurable: true
    });
    User.formatItemId = function (id, name) {
        return util.format("%s:%s", id, name);
    };
    Object.defineProperty(User.prototype, "loginSensor", {
        get: function () {
            return this._loginSensor;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(User.prototype, "kioskSensor", {
        get: function () {
            return this._kioskSensor;
        },
        enumerable: true,
        configurable: true
    });
    return User;
})(itemModule.Group);
exports.User = User;
var Users = (function (_super) {
    __extends(Users, _super);
    function Users(o) {
        var _this = this;
        _super.call(this, o);
        this._bypassAuthIps = {};
        this._bypassAuthIps = o.bypassAuthIps;
        _.forEach(o.users, function (user) {
            user.addParent(_this);
        }, this);
        if (!this.getUser(User.ADMIN))
            new User({
                id: User.ADMIN,
                password: null,
                accessRestApi: true,
                pinCode: null,
                forcePinCode: false,
                metadata: null
            }).addParent(this);
        if (!this.getUser(User.ANONYMOUS))
            new User({
                id: User.ANONYMOUS,
                password: null,
                accessRestApi: false,
                pinCode: null,
                forcePinCode: false,
                metadata: null
            }).addParent(this);
    }
    Users.prototype.getUser = function (name) {
        var userFullId = util.format("user:%s", name).toLowerCase();
        var item = this._childItems[userFullId];
        if (U.isNullOrUndefined(item))
            return null;
        assert(item instanceof User);
        var user = item;
        return user;
    };
    Users.prototype.isBypassAuthIp = function (ip) {
        return this._bypassAuthIps[ip] === true;
    };
    Users.prototype.getAdmin = function () {
        return this.getUser(User.ADMIN);
    };
    Users.prototype.getAnonymous = function () {
        return this.getUser(User.ANONYMOUS);
    };
    Users.prototype._authenticate = function (name, password) {
        var user = this.getUser(name);
        if (user == null)
            return null;
        // users without password cannot be authenticated
        if (user.password == null)
            return null;
        if (user.password != password)
            return null;
        return user;
    };
    Users.prototype.authenticate = function (name, password) {
        var user = this._authenticate(name, password);
        if (user == null)
            logger.warning("authentication failed. name:%s, pass:%s", name, password);
        return user;
    };
    return Users;
})(itemModule.Group);
exports.Users = Users;
//# sourceMappingURL=auth.js.map