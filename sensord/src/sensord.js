var assert = require('chai').assert;
require('traceur/bin/traceur-runtime');

assert.type = function (actual, type) {
    if (type === $traceurRuntime.type.any) {
        return actual;
    }

    if (type === $traceurRuntime.type.void) {
        assert.isUndefined(actual);
        return actual;
    }

    if ($traceurRuntime.type[type.name] === type) {
        // chai.assert treats Number as number :'(
        // Use runtime to handle symbol
        assert.equal($traceurRuntime.typeof(actual), type.name);
    } else if (type instanceof $traceurRuntime.GenericType) {
        assert.type(actual, type.type);
        if (type.type === Array) {
            for (var i = 0; i < actual.length; i++) {
                assert.type(actual[i], type.argumentTypes[0]);
            }
        } else {
            throw new Error(`Unsupported generic type${type}`);
        }
    } else {
        assert.instanceOf(actual, type);
    }

    // TODO(arv): Handle more generics, structural types and more.

    return actual;
};

assert.argumentTypes = function(...params) {
    for (var i = 0; i < params.length; i += 2) {
        if (params[i + 1] !== null) {
            assert.type(params[i], params[i + 1]);
        }
    }
};

assert.returnType = assert.type;

require("./app");

//import {Test} from './test.js';
//
//var t = new Test ("10", "12");
//t.test();
//