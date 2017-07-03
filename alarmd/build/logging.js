"use strict";
///<reference path="externals.d.ts"/>
var util = require('util');
var path = require('path');
var winston = require('winston');
var moment = require('moment');
var _ = require('lodash');
var Logger = (function () {
    function Logger(filename) {
        this.filename = path.basename(filename, path.extname(filename));
        this.lowerFilename = this.filename.toLowerCase();
        this.prefix = "[" + this.filename + "] ";
    }
    Logger.prototype.logv = function (level, args) {
        var w = winston;
        if (w.levels && w.moduleLevels) {
            var levelNumber = w.levels[level];
            var moduleLevel = w.moduleLevels[this.lowerFilename];
            if (!_.isUndefined(moduleLevel) && !_.isUndefined(levelNumber)) {
                if (levelNumber < moduleLevel)
                    return;
            }
        }
        var now = new Date();
        var prefix = moment(now).format("YYYY-MM-DD HH:mm:ss") + " " + this.prefix;
        if (args.length == 0) {
            args = [prefix];
        }
        else {
            args[0] = prefix + args[0].toString();
        }
        var msg = util.format.apply(this, args);
        winston.log(level, msg);
    };
    Logger.prototype.log = function (level) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        this.logv(level, args);
    };
    Logger.prototype.debug = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        this.logv("debug", args);
    };
    Logger.prototype.info = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        this.logv("info", args);
    };
    Logger.prototype.warn = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        this.logv("warning", args);
    };
    Logger.prototype.warning = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        this.logv("warning", args);
    };
    Logger.prototype.error = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        this.logv("error", args);
    };
    return Logger;
}());
exports.Logger = Logger;
//# sourceMappingURL=logging.js.map