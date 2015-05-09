/* global describe, it, beforeEach */
///<reference path="./externals.d.ts"/>
import assert = require('assert')
import mocha = require('mocha')

import itemModule = require('./item')
import Item = itemModule.Item;
import Sensor = itemModule.Sensor;

describe('Item', function () {

  describe('Item default values', function () {

    it('should have a default name. unless defined', () => {
      assert.equal(new Item({id:'itemId'}).name, "itemId");
      assert.equal(new Item({id:'itemId', name:'itemName'}).name, "itemName");
    });
  });


  describe('Item Events', () => {

    describe('Item Simple Events', () => {
      var sensor = new Sensor({id:'itemId', gpioId:5});

      var count :number = 0;

      it('should notify on state change and only once', () => {
        var syncPoint:itemModule.SyncPoint = new itemModule.SyncPoint ();

        sensor.on("event", (itemEvent) => {
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
