/* global describe, it, beforeEach */
///<reference path="./externals.d.ts"/>
var assert = require('assert');
var itemModule = require('./item');
var Item = itemModule.Item;
var Sensor = itemModule.Sensor;
describe('Item', function () {
    describe('Item default values', function () {
        it('should have a default name. unless defined', function () {
            assert.equal(new Item({ id: 'itemId' }).name, "itemId");
            assert.equal(new Item({ id: 'itemId', name: 'itemName' }).name, "itemName");
        });
    });
    describe('Item Events', function () {
        describe('Item Simple Events', function () {
            var sensor = new Sensor({ id: 'itemId', gpioId: 5 });
            var count = 0;
            it('should notify on state change and only once', function () {
                var syncPoint = new itemModule.SyncPoint();
                sensor.on("event", function (itemEvent) {
                    ++count;
                    assert.equal(itemEvent.item.id, "itemId");
                    assert.equal(itemEvent.originator, null);
                    assert.equal(itemEvent.syncPoint.value, syncPoint.value + 1);
                });
                sensor.state = "1";
                assert.equal(count, 1);
            });
        });
    });
});
//# sourceMappingURL=test-item.js.map