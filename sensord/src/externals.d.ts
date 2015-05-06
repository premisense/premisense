///<reference path="../typings/node/node.d.ts"/>
///<reference path="../typings/winston/winston.d.ts"/>
///<reference path="../typings/q/Q.d.ts"/>
///<reference path="../typings/split/split.d.ts"/>
///<reference path="../typings/yargs/yargs.d.ts"/>
///<reference path="../typings/lodash/lodash.d.ts"/>


declare module "serialport" {
  import events = require('events')

  export interface Port {
    comName: string;
    pnpId: string;
    manufacturer: string;
  }

  export function list(cb : (err: any, ports: Port[]) => void);
  export class SerialPort extends events.EventEmitter {
    construct(path: string, options: any);
    construct(path: string, options: any, openImmediately : boolean);

    open(error: () => void);
  }
}

declare module "mqtt" {
  import events = require('events')

  export class Client extends events.EventEmitter {
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

declare module "daemon" {
  module Daemon {
    interface Interface {
      (...args:any[]):any;
    }
  }
  var daemon: Daemon.Interface;
  export = daemon;
}

/*
declare module "winston" {
  function log(level: string, message: string, metadata?: any);
  function debug(message: string, metadata?: any);
  function info(message: string, metadata?: any);
  function warn(message: string, metadata?: any);
  function error(message: string, metadata?: any);

  function add(transport: Transport, options: any);
  function remove(transport: Transport);

  function profile(name: string);

  function query(options: any, done: (err: any, results: any) => void);

  function stream(options: any): any;

  function handleExceptions(transport: Transport);

  interface Transport {
  }
  interface Transports {
    File: Transport;
    Console: Transport;
    Loggly: Transport;
  }
  export var transports: Transports;
  export var exitOnError: boolean;
}
*/

