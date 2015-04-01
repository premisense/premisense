///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import Q = require('q')
import assert = require('assert')
import path = require('path');
import winston = require('winston');



export class Logger {
  filename: string;
  prefix: string;
  constructor(filename: string) {
    this.filename = path.basename(filename, path.extname(filename));
    this.prefix = "[" + this.filename + "]:";
  }

  logv(level:string, args:any[]) : void {
    if (args.length == 0) {
      args = [this.prefix];
    } else {
      args[0] = this.prefix + args[0].toString();
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
