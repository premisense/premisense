"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var request = require('request');
var Q = require('q');
var U = require('./u');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
(function (Priority) {
    Priority[Priority["NORMAL"] = 0] = "NORMAL";
    Priority[Priority["HIGH"] = 1] = "HIGH";
    Priority[Priority["CRITICAL"] = 2] = "CRITICAL";
})(exports.Priority || (exports.Priority = {}));
var Priority = exports.Priority;
var Message = (function () {
    function Message(o) {
        this.title = o.title;
        this.body = o.body;
        this.priority = o.priority;
    }
    return Message;
}());
exports.Message = Message;
var PushNotification = (function () {
    function PushNotification() {
    }
    PushNotification.prototype.send = function (msg) {
        var deferred = Q.defer();
        deferred.resolve(true);
        return deferred.promise;
    };
    return PushNotification;
}());
exports.PushNotification = PushNotification;
var PushoverMessage = (function (_super) {
    __extends(PushoverMessage, _super);
    function PushoverMessage(o) {
        _super.call(this, o);
        this.appKey = o.appKey;
        this.userKey = o.userKey;
        this.sound = o.sound;
    }
    return PushoverMessage;
}(Message));
exports.PushoverMessage = PushoverMessage;
var Pushover = (function (_super) {
    __extends(Pushover, _super);
    function Pushover(o) {
        _super.call(this);
        this.defaultAppKey = o.defaultAppKey;
        this.defaultUserKey = o.defaultUserKey;
        this.defaultTitle = o.defaultTitle;
        this.defaultPriority = o.defaultPriority;
        this.defaultSound = o.defaultSound;
        this.prioritySoundMap = o.prioritySoundMap;
        this.localAddress = o.localAddress;
    }
    Pushover.prototype.send = function (msg) {
        var deferred = Q.defer();
        var pmsg;
        if (msg instanceof PushoverMessage)
            pmsg = msg;
        else {
            pmsg = new PushoverMessage({
                title: msg.title,
                body: msg.body,
                priority: msg.priority
            });
        }
        var params = {
            token: (!U.isNullOrUndefined(pmsg.appKey)) ? pmsg.appKey : this.defaultAppKey,
            user: (!U.isNullOrUndefined(pmsg.userKey)) ? pmsg.userKey : this.defaultUserKey,
            title: (!U.isNullOrUndefined(pmsg.title)) ? pmsg.title : this.defaultTitle,
            message: pmsg.body
        };
        var priority = (pmsg.priority != null) ? pmsg.priority : this.defaultPriority;
        var pushoverPriority;
        if (priority == null || U.isNullOrUndefined(Pushover.priorityMap[priority]))
            pushoverPriority = -1;
        else
            pushoverPriority = Pushover.priorityMap[priority];
        params['priority'] = pushoverPriority;
        if (pushoverPriority == 2) {
            params['retry'] = "30";
            params['expire'] = "600";
        }
        var sound = pmsg.sound;
        if (U.isNullOrUndefined(sound)) {
            if (!U.isNullOrUndefined(priority) && !U.isNullOrUndefined(this.prioritySoundMap))
                sound = this.prioritySoundMap[priority];
        }
        if (U.isNullOrUndefined(sound))
            sound = this.defaultSound;
        if (!U.isNullOrUndefined(sound))
            params['sound'] = sound;
        //var formData = new formdata.FormData();
        //_.forEach(params, (v,k) => {
        //  formData.append(k, v);
        //});
        var u = "https://api.pushover.net:443/1/messages.json";
        var arequest = request;
        arequest.post({ url: u, formData: params, localAddress: this.localAddress }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                logger.info("pushover notification completed. body: ", body);
                deferred.resolve(true);
            }
            else {
                logger.info("pushover notification failed. error:%s. %s", response.statusCode, body);
                deferred.resolve(false);
            }
        });
        return deferred.promise;
    };
    Pushover.priorityMap = {
        0: 0,
        1: 1,
        2: 2
    };
    return Pushover;
}(PushNotification));
exports.Pushover = Pushover;
//# sourceMappingURL=push_notification.js.map