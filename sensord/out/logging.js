"use strict";
"use strict";
var assert = require('chai').assert;
var util = require('util');
var events = require('events');
var path = require('path');
var winston = require('winston');
var Logger = (function() {
  function Logger(filename) {
    assert.argumentTypes(filename, $traceurRuntime.type.string);
    this.filename = path.basename(filename, path.extname(filename));
    this.prefix = "[" + this.filename + "]:";
  }
  return ($traceurRuntime.createClass)(Logger, {
    get filename() {
      return assert.returnType((this.$__0), $traceurRuntime.type.string);
    },
    set filename(value) {
      assert.argumentTypes(value, $traceurRuntime.type.string);
      this.$__0 = value;
    },
    get prefix() {
      return assert.returnType((this.$__1), $traceurRuntime.type.string);
    },
    set prefix(value) {
      assert.argumentTypes(value, $traceurRuntime.type.string);
      this.$__1 = value;
    },
    get a() {
      return assert.returnType((this.$__2), $traceurRuntime.genericType(Array, $traceurRuntime.type.string));
    },
    set a(value) {
      assert.argumentTypes(value, $traceurRuntime.genericType(Array, $traceurRuntime.type.string));
      this.$__2 = value;
    },
    test: function(level, args) {
      assert.argumentTypes(level, $traceurRuntime.type.string, args, $traceurRuntime.genericType(Array, $traceurRuntime.type.string));
    },
    logv: function(level, args) {
      assert.argumentTypes(level, $traceurRuntime.type.string, args, $traceurRuntime.genericType(Array, $traceurRuntime.type.any));
      if (args.length == 0) {
        args = [this.prefix];
      } else {
        args[0] = this.prefix + args[0].toString();
      }
      var msg = util.format.apply(this, args);
      winston.log(level, msg);
    },
    log: function(level) {
      for (var args = [],
          $__4 = 1; $__4 < arguments.length; $__4++)
        args[$__4 - 1] = arguments[$__4];
      assert.argumentTypes(level, $traceurRuntime.type.string);
      this.logv(level, args);
    },
    debug: function() {
      for (var args = [],
          $__5 = 0; $__5 < arguments.length; $__5++)
        args[$__5] = arguments[$__5];
      this.logv("debug", args);
    },
    info: function() {
      for (var args = [],
          $__6 = 0; $__6 < arguments.length; $__6++)
        args[$__6] = arguments[$__6];
      this.logv("info", args);
    },
    warn: function() {
      for (var args = [],
          $__7 = 0; $__7 < arguments.length; $__7++)
        args[$__7] = arguments[$__7];
      this.logv("warning", args);
    },
    warning: function() {
      for (var args = [],
          $__8 = 0; $__8 < arguments.length; $__8++)
        args[$__8] = arguments[$__8];
      this.logv("warning", args);
    },
    error: function() {
      for (var args = [],
          $__9 = 0; $__9 < arguments.length; $__9++)
        args[$__9] = arguments[$__9];
      this.logv("error", args);
    }
  }, {});
}());
Object.defineProperties(module.exports, {
  Logger: {get: function() {
      return Logger;
    }},
  __esModule: {value: true}
});
//# sourceMappingURL=logging.js.map
