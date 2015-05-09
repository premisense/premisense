"use strict";
"use strict";
var assert = require('chai').assert;
var util = require('util');
var _ = require('lodash');
function isNOU(v) {
  assert.argumentTypes(v, $traceurRuntime.type.any);
  return assert.returnType(((_.isNull(v) || _.isUndefined(v))), $traceurRuntime.type.boolean);
}
Object.defineProperty(isNOU, "parameters", {get: function() {
    return [[$traceurRuntime.type.any]];
  }});
function isNullOrUndefined(v) {
  assert.argumentTypes(v, $traceurRuntime.type.any);
  return assert.returnType(((_.isNull(v) || _.isUndefined(v))), $traceurRuntime.type.boolean);
}
Object.defineProperty(isNullOrUndefined, "parameters", {get: function() {
    return [[$traceurRuntime.type.any]];
  }});
Object.defineProperties(module.exports, {
  isNOU: {get: function() {
      return isNOU;
    }},
  isNullOrUndefined: {get: function() {
      return isNullOrUndefined;
    }},
  __esModule: {value: true}
});
//# sourceMappingURL=u.js.map
