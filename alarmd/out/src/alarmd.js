"use strict";
var assert = require('chai').assert;
require('traceur/bin/traceur-runtime');
assert.type = function(actual, type) {
  if (type === $traceurRuntime.type.any) {
    return actual;
  }
  if (type === $traceurRuntime.type.void) {
    assert.isUndefined(actual);
    return actual;
  }
  if ($traceurRuntime.type[type.name] === type) {
    assert.equal($traceurRuntime.typeof(actual), type.name);
  } else if (type instanceof $traceurRuntime.GenericType) {
    assert.type(actual, type.type);
    if (type.type === Array) {
      for (var i = 0; i < actual.length; i++) {
        assert.type(actual[i], type.argumentTypes[0]);
      }
    } else {
      throw new Error(("Unsupported generic type" + type));
    }
  } else {
    assert.instanceOf(actual, type);
  }
  return actual;
};
assert.argumentTypes = function() {
  for (var params = [],
      $__0 = 0; $__0 < arguments.length; $__0++)
    params[$__0] = arguments[$__0];
  for (var i = 0; i < params.length; i += 2) {
    if (params[i + 1] !== null) {
      assert.type(params[i], params[i + 1]);
    }
  }
};
assert.returnType = assert.type;
require("./app");
//# sourceMappingURL=alarmd.js.map
