///<reference path="externals.d.ts"/>
import util = require('util')
import assert = require('assert')
import _ = require('lodash')
import child_process = require('child_process')


export function isNOU(v:any):boolean {
  return (_.isNull(v) || _.isUndefined(v));
}

export function isNullOrUndefined(v:any):boolean {
  return (_.isNull(v) || _.isUndefined(v));
}

export function assertDebugger(v:any):void {
  if (v)
    return;
  debugger;
  assert (false);
}

