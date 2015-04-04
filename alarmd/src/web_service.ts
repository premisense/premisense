///<reference path="externals.d.ts"/>
import util = require('util')
import eventsModule = require('events')
import through = require('through')
import express = require('express')
import http = require('http')
import websocket = require('websocket')
import assert = require('assert')
import _ = require('lodash')
import Q = require('q')
import compression = require('compression')

import U = require('./u')
import itemModule = require('./item')
import auth = require('./auth')
import service = require('./service')
import sensor_history = require('./sensor_history')
import event_log = require('./event_log')
import arming = require('./arming');

import logging = require('./logging');
var logger = new logging.Logger(__filename);

interface Fields {
  device_id: string;
  protocol: string;
  host: string;
  username: string;
  password: string;
}

export interface WebServiceOptions {
  port ?: number;
}

export class WebService {
  app:express.Express = express();
  httpServer:http.Server;
  wsServer:websocket.server;
  options:WebServiceOptions;

  constructor(options:WebServiceOptions) {
    this.options = options;


    this.app
      .use(WebService.bodyReader)
      .use(compression())
      .get('/', WebService.home)
      .get('/login', WebService.authFilter, WebService.apiFilter, WebService.login)
      .get('/events', WebService.authFilter, WebService.apiFilter, WebService.getEvents)
      .post('/armed_state', WebService.authFilter, WebService.apiFilter, WebService.postArmedState)
      .post('/bypass_sensor', WebService.authFilter, WebService.apiFilter, WebService.postBypassSensor)
      .post('/cancel_arming', WebService.authFilter, WebService.apiFilter, WebService.postCancelArming)
      .get('/sensor_history.json', WebService.authFilter, WebService.apiFilter, WebService.getSensorHistory)
      .get('/event_log', WebService.authFilter, WebService.apiFilter, WebService.getEventLog)

    ;
  }

  static parseAuth(auth:string):any {
    if (!auth) return;

    // malformed
    var parts = auth.split(' ');
    if ('basic' != parts[0].toLowerCase())
      return;
    if (!parts[1])
      return;
    auth = parts[1];

    // credentials
    auth = new Buffer(auth, 'base64').toString();
    var match = auth.match(/^([^:]*):(.*)$/);
    if (!match)
      return;

    return {name: match[1], pass: match[2]};
  }

  static authUser(authorization:string, ip:string, reject:(code, description) => void):auth.User {
    var user:auth.User = null;
    var basicAuthUser = WebService.parseAuth(authorization);

    if (!basicAuthUser) {
      if (service.Service.instance.users.isBypassAuthIp(ip))
        user = service.Service.instance.users.getAdmin();
      else
        user = service.Service.instance.users.getAnonymous();
    } else {
      user = service.Service.instance.users.authenticate(basicAuthUser.name, basicAuthUser.pass);
    }

    if (user == null) {
      reject(401, "authorization failed");
      return null;
    }

    return user;
  }

  static authFilter(req:express.Request, res:express.Response, next:Function):void {

    var user:auth.User = null;

    var auth = req.headers["authorization"] || req.query.authorization;

    var ip = req.connection.remoteAddress.toString();

    if ((user = WebService.authUser(auth, ip, (code, description) => {
        res.status(code).send(description);
      })) == null)
      return;

    req.user = user;

    next();
  }

  static checkApi(req:express.Request, reject:(code, description) => void):boolean {
    assert(req.user != null && req.user instanceof auth.User);
    var user:auth.User = <auth.User> req.user;

    if (!user.accessRestApi) {
      reject(401, "authorization required");
      return false;
    }
    return true;
  }

  static apiFilter(req:express.Request, res:express.Response, next:Function):void {
    if (!WebService.checkApi(req, (code, description) => {
        res.status(code).send(description);
      }))
      return;

    next();
  }

  static home(req:express.Request, res:express.Response):void {
    res.send("OK\n");
  }

  static login(req:express.Request, res:express.Response):void {
    res.send("OK\n");
  }

  static replaceFields(s:string, fields:Fields):string {
    var result = s.replace(/\$\{([^\}]+)\}/g, (exp, s1):string => {
      var x = _.result(fields, s1, '???');
      return x;
    });
    return result;
  }

  static sendEvents(since:itemModule.SyncPoint, write:(s:string) => void, close:()=>void, fields:Fields, maxSize:number):Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    //TODO deal with session counters

    var maxBufferSize:number = 16 * 1024;
    var bytesWritten:number = 0;
    var buffer:string = '';
    var majorEvents:number = 0; // to avoid loops, we close a response only when majorEvents > 0


    var idleTimer:NodeJS.Timer = null;
    var flushTimer:NodeJS.Timer = null;
    var strm:through.ThroughStream = null;

    var cancelIdleTimer = () => {
      if (idleTimer != null) {
        clearInterval(idleTimer);
        idleTimer = null;
      }
    };

    var cancelFlushTimer = () => {
      if (flushTimer != null) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
    };

    var flush = (force:boolean = false) => {
      if (force || buffer.length > 0) {
        var jsonStr = JSON.stringify(itemModule.Nop.instance.toJson()) + "\n";
        buffer += jsonStr;
        bytesWritten += buffer.length;
        var s = WebService.replaceFields(buffer, fields);
        buffer = '';
        cancelFlushTimer();

        write(s);
      }
      if ((force || majorEvents > 0) && maxSize > 0 && bytesWritten > maxSize) {
        cancelIdleTimer();
        cancelFlushTimer();

        assert(strm != null);
        strm.end();
        strm = null;

        close();
      }
    };

    idleTimer = setInterval(() => {
      flush(true);
    }, 30000);

    var writeBuf = (s) => {
      buffer += s;

      // first cancel current timer
      cancelFlushTimer();

      if (buffer.length > maxBufferSize)
        flush();
      else {
        // then start a new one
        flushTimer = setInterval(() => {
          flush(true);
        }, 5);
      }
    };

    var strm = service.Service.instance.events.stream(since);

    var uniqueEvents = {};

    strm.on('data', (itemEvent:itemModule.ItemEvent) => {

      var dupEventJson = _.cloneDeep(itemEvent.json);
      delete dupEventJson['syncValue'];
      var eventStr = JSON.stringify(dupEventJson);
      if (uniqueEvents[itemEvent.item.id] !== eventStr) {
        uniqueEvents[itemEvent.item.id] = eventStr;

        if (!itemEvent.item.minor)
          ++majorEvents;

        var json = itemEvent.json;
        var s = JSON.stringify(json) + "\n";

        writeBuf(s);
      }
    });
    strm.resume();

    return deferred.promise;
  }

  static getSensorHistory(req:express.Request, res:express.Response):void {
    var itemId = req.query.item;
    if (U.isNullOrUndefined(itemId)) {
      res.status(400).send("expecting item parameter");
      return;
    }

    var item:itemModule.Item = service.Service.instance.items.all.at(itemId);

    if (U.isNullOrUndefined(item)) {
      res.status(400).send("no such item");
      return;
    }

    service.Service.instance.sensorHistory.query(itemId)
    .then((itemHistory) => {
        var response = JSON.stringify(itemHistory.history);
        res.status(200).send(response);
      }, (err) => {
        res.status(500).send("failed to process query. event logged.");
      });

  }

  static getEventLog(req:express.Request, res:express.Response):void {

    service.Service.instance.armedStates.active.updateLogEvent()
    .then (() => {
      service.Service.instance.eventLog.query()
        .then((events:event_log.Event[]) => {
          var eventsJsons = [];
          _.forEach(events, (e) => {
            eventsJsons.push(e.toJson());
          }, this);
          var response = JSON.stringify(eventsJsons);
          res.status(200).send(response);
        }, (err) => {
          res.status(500).send("failed to process query. event logged.");
        });
    });

  }

  static getEvents(req:express.Request, res:express.Response):void {
    var maxSizeString = req.query.maxSize;
    var sinceString = req.query.since;

    var since:itemModule.SyncPoint;
    try {
      since = itemModule.SyncPoint.parse(sinceString);
    } catch (e) {
      res.status(400).send("invalid since format");
      return;
    }

    var maxSize:number;

    try {
      maxSize = (U.isNullOrUndefined(maxSizeString)) ? 1 : parseInt(maxSizeString);
    } catch (e) {
      res.status(400).send("invalid maxSize format");
      return;
    }

    var fields:Fields = {
      device_id: _.result(req.query, 'device_id', ''),
      protocol: req.protocol,
      host: req.headers['host'],
      username: (<auth.User>req.user).name,
      password: (<auth.User>req.user).password
    };

    res.setHeader('Content-Type', 'text/plain');

    WebService.sendEvents(since, (s) => {
        res.write(s);

        // the below flush is needed to deal with compression
        var r:any = res;
        r.flush();
      }, () => {
        res.end();
      }, fields, maxSize
    );
  }

  static onWSConnect(connection:websocket.connection):void {
    logger.debug("onWSConnect");
  }

  static onWSRequest(request:websocket.request):void {
    logger.debug("onWSRequest");

    var req:any = request;

    if (request.resourceURL.pathname !== '/events') {
      request.reject(404, "path not found");
      return;
    }

    if (request.requestedProtocols.indexOf("events") == -1) {
      request.reject(400, "unsupported sub-protocol");
      return;
    }

    var auth = req.httpRequest.headers["authorization"] || req.resourceURL.query.authorization;
    var ip = request.remoteAddress.toString();

    var user:auth.User = null;

    if ((user = WebService.authUser(auth, ip, (code, description) => {
        request.reject(code, description);
      })) == null)
      return;

    var since:itemModule.SyncPoint;
    try {
      var sinceString = req.resourceURL.query.since;

      since = itemModule.SyncPoint.parse(sinceString);
    } catch (e) {
      request.reject(400, "invalid since parameter");
      return;
    }

    var connection = request.accept('events', request.origin);
    connection.on('message', (msg) => {
      if (msg.type === 'utf8') {
        logger.debug("websocket msg - %s", msg.utf8Data);
      } else {
        logger.warn("websocket msg. unknown type: %s", msg.type);
      }
    });

    connection.on("close", (code, description) => {
      logger.debug("websocket closed. %s-%s", code, description);
      //TODO close streams
    });

    var fields:Fields = {
      device_id: _.result(req.resourceURL.query, 'device_id', ''),
      protocol: req.httpRequest.protocol || "http",
      host: req.httpRequest.headers['host'],
      username: user.name,
      password: user.password
    };

    WebService.sendEvents(since, (s) => {
      connection.sendUTF(s);
    }, () => {
      connection.close();
    }, fields, -1);
  }

  static onWSClose(connection:websocket.connection):void {
    logger.debug("onWSClose");
  }

  static bodyReader(req:express.Request, res:express.Response, next:Function):void {
    req.body = '';
    req.setEncoding('utf8');
    req.on('data', function (chunk) {
      if (req.body.length + chunk.length > 10240) {
        res.status(400).send("body length is too long");
        return;
      }
      req.body += chunk;
    });
    req.on('end', function () {
      next();
    });
  }

  static checkPinCode(req:express.Request, res:express.Response):boolean {
    var pinCode = req.headers['x-pincode'];

    var user:auth.User = <auth.User>req.user;

    if (user.pinCode == null && _.isUndefined(pinCode))
      return true;

    if (pinCode === user.pinCode)
      return true;

    if (pinCode == null) {
      res.status(403).send("authorization required");
      return false;
    }

    res.status(403).send("invalid pin code");
    return false;
  }

  static postArmedState(req:express.Request, res:express.Response):void {
    var armedState = <arming.ArmedState> service.Service.instance.armedStates.at(req.body);
    if (armedState == null) {
      res.status(400).send("no such armed state");
    }

    if (!WebService.checkPinCode(req, res))
      return;


    armedState.activate()
      .then(() => {
        res.status(200).send("OK\n");
      });
  }

  static postBypassSensor(req:express.Request, res:express.Response):void {
    if (!WebService.checkPinCode(req, res))
      return;
    var item = service.Service.instance.armedStates.active.at(req.body);
    if (item == null) {
      res.status(400).send(util.format("unknown sensor '%s' or not armed", req.body));
      return;
    }

    service.Service.instance.armedStates.active.bypass(item);
    res.status(200).send("OK\n");

  }

  static postCancelArming(req:express.Request, res:express.Response):void {
    if (service.Service.instance.armedStates.prev == null) {
      res.status(400).send("no prev armed state");
      return;
    }

    if (service.Service.instance.armedStates.active.timeLeft == 0) {
      res.status(400).send("already armed");
      return;
    }

    if (!WebService.checkPinCode(req, res))
      return;

    service.Service.instance.armedStates.prev.activate()
      .then(() => {
        res.status(200).send("OK\n");
      });
  }

  start():Q.Promise<boolean> {
    var deferred:Q.Deferred<boolean> = Q.defer<boolean>();

    this.httpServer = this.app.listen(this.options.port, () => {
      deferred.resolve(true);

    });
    this.wsServer = new websocket.server({
      httpServer: this.httpServer,
      autoAcceptConnections: false
    });

    this.wsServer.on("connect", WebService.onWSConnect);
    this.wsServer.on("request", WebService.onWSRequest);
    this.wsServer.on("close", WebService.onWSConnect);

    return deferred.promise;

  }

}
