///<reference path="externals.d.ts"/>
import util = require('util')
import assert = require('assert')
import _ = require('lodash')


export function isNOU(v:any):boolean {
  return (_.isNull(v) || _.isUndefined(v));
}

export function isNullOrUndefined(v:any):boolean {
  return (_.isNull(v) || _.isUndefined(v));
}
