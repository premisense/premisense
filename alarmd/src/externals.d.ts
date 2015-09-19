///<reference path="../typings/node/node.d.ts"/>
///<reference path="../typings/winston/winston.d.ts"/>
///<reference path="../typings/through/through.d.ts"/>
///<reference path="../typings/q/Q.d.ts"/>
///<reference path="../typings/express/express.d.ts"/>
///<reference path="../typings/compression/compression.d.ts"/>
///<reference path="../typings/request/request.d.ts"/>
///<reference path="../typings/form-data/form-data.d.ts"/>
///<reference path="../typings/websocket/websocket.d.ts"/>
///<reference path="../typings/uuid/UUID.d.ts"/>
///<reference path="../typings/lodash/lodash.d.ts"/>
///<reference path="../typings/mocha/mocha.d.ts"/>
///<reference path="../typings/yargs/yargs.d.ts"/>
///<reference path="../typings/moment/moment.d.ts"/>
///<reference path="../typings/nedb/nedb.d.ts"/>
///<reference path="../typings/morgan/morgan.d.ts"/>
///<reference path="../typings/split/split.d.ts"/>

declare module "mqtt" {
  import eventsModule = require('events')

  export class Client extends eventsModule.EventEmitter {
    subscribe(...params : any[]) : Client;
    publish(topic:string, message:string, opts ?:any, callback ?: any) : Client;
  }

  function connect(options: any) : Client;
  function connect(url: string, options: any) : Client;
}


declare module "winston-syslog" {
  export class Syslog{
    constructor(options: any);
  }
}

declare module "cors" {
  module Cors {
    interface Interface {
      (...args:any[]):any;
    }
  }
  var cors: Cors.Interface;
  export = cors;
}


