"use strict";

var assert = require('chai').assert;
var util = require('util');
var _ = require('lodash');

export function isNOU(v:any):boolean {
  return (_.isNull(v) || _.isUndefined(v));
}

export function isNullOrUndefined(v:any):boolean {
  return (_.isNull(v) || _.isUndefined(v));
}
