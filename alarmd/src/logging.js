///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import Q = require('q')
import assert = require('assert')
import path = require('path');
import winston = require('winston');
import moment = require('moment')
import _ = require('lodash')



export class Logger {
  filename: string;
  lowerFilename: string;
  prefix: string;
  constructor(filename: string) {
    this.filename = path.basename(filename, path.extname(filename));
    this.lowerFilename = this.filename.toLowerCase();
    this.prefix = "[" + this.filename + "] ";
  }

  logv(level:string, args:any[]) : void {

    var w:any = winston;
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
    } else {
      args[0] = prefix + args[0].toString();
    }

    var msg = util.format.apply(this, args);

    winston.log(level, msg);
  }

  log(level:string, ...args:any[]) : void {
    this.logv(level, args);
  }

  debug(...args: any[]):void {
    this.logv("debug", args);
  }

  info(...args: any[]):void {
    this.logv("info", args);
  }

  warn(...args: any[]):void {
    this.logv("warning", args);
  }

  warning(...args: any[]):void {
    this.logv("warning", args);
  }

  error(...args: any[]):void {
    this.logv("error", args);
  }

}
