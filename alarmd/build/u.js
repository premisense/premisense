"use strict";
var assert = require('assert');
var _ = require('lodash');
function isNOU(v) {
    return (_.isNull(v) || _.isUndefined(v));
}
exports.isNOU = isNOU;
function isNullOrUndefined(v) {
    return (_.isNull(v) || _.isUndefined(v));
}
exports.isNullOrUndefined = isNullOrUndefined;
function assertDebugger(v) {
    if (v)
        return;
    debugger;
    assert(false);
}
exports.assertDebugger = assertDebugger;
//# sourceMappingURL=u.js.map