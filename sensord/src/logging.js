"use strict";

var assert = require('chai').assert;
var util = require('util');
var events = require('events');
var path = require('path');
var winston = require('winston');

export class Logger {
  filename: string;
  prefix: string;
  a:Array<string>;
  constructor(filename: string) {
    this.filename = path.basename(filename, path.extname(filename));
    this.prefix = "[" + this.filename + "]:";
  }

  test(level:string, args:Array<string>):void {

  }

  logv(level:string, args:Array<any>) : void {
    if (args.length == 0) {
      args = [this.prefix];
    } else {
      args[0] = this.prefix + args[0].toString();
    }

    var msg = util.format.apply(this, args);

    winston.log(level, msg);
  }

  log(level:string, ...args:Array<any>) : void {
    this.logv(level, args);
  }

  debug(...args: Array<any>):void {
    this.logv("debug", args);
  }

  info(...args: Array<any>):void {
    this.logv("info", args);
  }

  warn(...args: Array<any>):void {
    this.logv("warning", args);
  }

  warning(...args: Array<any>):void {
    this.logv("warning", args);
  }

  error(...args: Array<any>):void {
    this.logv("error", args);
  }

}
