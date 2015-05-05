///<reference path="externals.d.ts"/>
var util = require('util');
var through = require('through');
var express = require('express');
var websocket = require('websocket');
var assert = require('assert');
var _ = require('lodash');
var Q = require('q');
var compression = require('compression');
var morgan = require('morgan');
var split = require('split');
var cors = require('cors');
var U = require('./u');
var itemModule = require('./item');
var di = require('./domain_info');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var WebService = (function () {
    function WebService(options) {
        this.app = express();
        this.options = options;
        var logStream = through().pipe(split()).on('data', function (line) {
            logger.info(line);
        });
        var logFormat = ':remote-addr :remote-user :method :url HTTP/:http-version :status :res[content-length] - :response-time ms';
        var morganLogger = morgan(logFormat, {
            stream: logStream
        });
        this.app.use(morganLogger).use(cors()).use(WebService.domainWrapper).use(WebService.bodyReader).use(compression()).get('/', WebService.home).get('/login', WebService.authFilter, WebService.apiFilter, WebService.login).get('/events', WebService.authFilter, WebService.apiFilter, WebService.getEvents).post('/armed_state', WebService.authFilter, WebService.apiFilter, WebService.postArmedState).post('/bypass_sensor', WebService.authFilter, WebService.apiFilter, WebService.postBypassSensor).post('/cancel_arming', WebService.authFilter, WebService.apiFilter, WebService.postCancelArming).get('/sensor_history.json', WebService.authFilter, WebService.apiFilter, WebService.getSensorHistory).get('/event_log', WebService.authFilter, WebService.apiFilter, WebService.getEventLog);
    }
    WebService.getProto = function (req) {
        var fwdProto = req.header('x-forwarded-proto');
        if (!U.isNullOrUndefined(fwdProto))
            return fwdProto;
        return req.protocol;
    };
    WebService.replaceFields = function (req, res, next) {
        var authorization = req.headers["authorization"] || req.query.authorization;
        var basicAuthUser = WebService.parseAuth(authorization);
        var fields = {
            device_id: _.result(req.query, 'device_id', ''),
            protocol: WebService.getProto(req),
            host: req.headers['host'],
            username: (basicAuthUser) ? basicAuthUser.name : null,
            password: (basicAuthUser) ? basicAuthUser.pass : null
        };
        var r = res;
        var originalWrite = r.write;
        var originalWriteHead = r.writeHead;
        r.writeHead = function (statusCode, reasonPhrase, headers) {
            res.removeHeader('content-length');
            originalWriteHead.call(r, statusCode, reasonPhrase, headers);
        };
        r.write = function (data, encoding, callback) {
            var s = data.toString();
            s = WebService._replaceFields(s, fields);
            originalWrite.call(r, s, encoding, callback);
        };
        //r.write = ()
        next();
    };
    WebService.domainWrapper = function (req, res, next) {
        var self = di.service.webService;
        var domainInfo = di.create(di.active);
        domainInfo.domain.add(req);
        domainInfo.domain.add(res);
        domainInfo.domain.run(function () {
            next();
            //self.app.router(req, res, next);
        });
    };
    WebService.parseAuth = function (auth) {
        if (!auth)
            return;
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
        return { name: match[1], pass: match[2] };
    };
    WebService.authUser = function (authorization, ip, reject) {
        var user = null;
        var basicAuthUser = WebService.parseAuth(authorization);
        if (!basicAuthUser) {
            if (di.service.users.isBypassAuthIp(ip))
                user = di.service.users.getAdmin();
            else
                user = di.service.users.getAnonymous();
        }
        else {
            user = di.service.users.authenticate(basicAuthUser.name, basicAuthUser.pass);
        }
        if (user == null) {
            reject(401, "authorization failed");
            return null;
        }
        return user;
    };
    WebService.authFilter = function (req, res, next) {
        var user = null;
        var auth = req.headers["authorization"] || req.query.authorization;
        var ip = req.connection.remoteAddress.toString();
        if ((user = WebService.authUser(auth, ip, function (code, description) {
            res.status(code).send(description);
        })) == null)
            return;
        di.user = user;
        next();
    };
    WebService.checkApi = function (req, reject) {
        var user = di.user;
        if (!user.accessRestApi) {
            reject(401, "authorization required");
            return false;
        }
        return true;
    };
    WebService.apiFilter = function (req, res, next) {
        if (!WebService.checkApi(req, function (code, description) {
            res.status(code).send(description);
        }))
            return;
        next();
    };
    WebService.home = function (req, res) {
        res.send("OK\n");
    };
    WebService.login = function (req, res) {
        res.send("OK\n");
    };
    WebService._replaceFields = function (s, fields) {
        var result = s.replace(/\$\{([^\}]+)\}/g, function (exp, s1) {
            var x = _.result(fields, s1, '???');
            return x;
        });
        return result;
    };
    WebService.sendEvents = function (since, write, close, fields, maxSize) {
        var deferred = Q.defer();
        //TODO deal with session counters
        var maxBufferSize = 16 * 1024;
        var bytesWritten = 0;
        var buffer = '';
        var majorEvents = 0; // to avoid loops, we close a response only when majorEvents > 0
        var idleTimer = null;
        var flushTimer = null;
        var strm = null;
        var cancelIdleTimer = function () {
            if (idleTimer != null) {
                clearInterval(idleTimer);
                idleTimer = null;
            }
        };
        var cancelFlushTimer = function () {
            if (flushTimer != null) {
                clearInterval(flushTimer);
                flushTimer = null;
            }
        };
        var flush = function (force) {
            if (force === void 0) { force = false; }
            if (force || buffer.length > 0) {
                var jsonStr = JSON.stringify(itemModule.Nop.instance.toJson()) + "\n";
                buffer += jsonStr;
                bytesWritten += buffer.length;
                var s = WebService._replaceFields(buffer, fields);
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
        idleTimer = setInterval(function () {
            flush(true);
        }, 30000);
        var writeBuf = function (s) {
            buffer += s;
            // first cancel current timer
            cancelFlushTimer();
            if (buffer.length > maxBufferSize)
                flush();
            else {
                // then start a new one
                flushTimer = setInterval(function () {
                    flush(true);
                }, 5);
            }
        };
        var strm = di.itemEvents.stream(since);
        var uniqueEvents = {};
        strm.on('data', function (itemEvent) {
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
    };
    WebService.getSensorHistory = function (req, res) {
        var itemId = req.query.item;
        if (U.isNullOrUndefined(itemId)) {
            res.status(400).send("expecting item parameter");
            return;
        }
        var item = di.service.items.all.at(itemId);
        if (U.isNullOrUndefined(item)) {
            res.status(400).send("no such item");
            return;
        }
        di.service.sensorHistory.query(itemId).then(function (itemHistory) {
            var response = JSON.stringify(itemHistory.history);
            res.status(200).send(response);
        }, function (err) {
            res.status(500).send("failed to process query. event logged.");
        });
    };
    WebService.getEventLog = function (req, res) {
        var _this = this;
        di.service.armedStates.active.updateLogEvent().then(function () {
            di.service.eventLog.query().then(function (events) {
                var eventsJsons = [];
                _.forEach(events, function (e) {
                    eventsJsons.push(e.toJson());
                }, _this);
                var response = JSON.stringify(eventsJsons);
                res.status(200).send(response);
            }, function (err) {
                res.status(500).send("failed to process query. event logged.");
            });
        });
    };
    WebService.getEvents = function (req, res) {
        var maxSizeString = req.query.maxSize;
        var sinceString = req.query.since;
        var since;
        try {
            since = itemModule.SyncPoint.parse(sinceString);
        }
        catch (e) {
            res.status(400).send("invalid since format");
            return;
        }
        var maxSize;
        try {
            maxSize = (U.isNullOrUndefined(maxSizeString)) ? 1 : parseInt(maxSizeString);
        }
        catch (e) {
            res.status(400).send("invalid maxSize format");
            return;
        }
        var user = di.user;
        var fields = {
            device_id: _.result(req.query, 'device_id', ''),
            protocol: WebService.getProto(req),
            host: req.headers['host'],
            username: user.name,
            password: user.password
        };
        res.setHeader('Content-Type', 'text/plain');
        WebService.sendEvents(since, function (s) {
            res.write(s);
            // the below flush is needed to deal with compression
            var r = res;
            r.flush();
        }, function () {
            res.end();
        }, fields, maxSize);
    };
    WebService.onWSConnect = function (connection) {
        logger.debug("onWSConnect");
    };
    WebService.onWSRequest = function (request) {
        logger.debug("onWSRequest");
        var req = request;
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
        var user = null;
        if ((user = WebService.authUser(auth, ip, function (code, description) {
            request.reject(code, description);
        })) == null)
            return;
        var since;
        try {
            var sinceString = req.resourceURL.query.since;
            since = itemModule.SyncPoint.parse(sinceString);
        }
        catch (e) {
            request.reject(400, "invalid since parameter");
            return;
        }
        var connection = request.accept('events', request.origin);
        connection.on('message', function (msg) {
            if (msg.type === 'utf8') {
                logger.debug("websocket msg - %s", msg.utf8Data);
            }
            else {
                logger.warn("websocket msg. unknown type: %s", msg.type);
            }
        });
        connection.on("close", function (code, description) {
            logger.debug("websocket closed. %s-%s", code, description);
            //TODO close streams
        });
        var fields = {
            device_id: _.result(req.resourceURL.query, 'device_id', ''),
            protocol: req.httpRequest.headers["x-forwarded-proto"] || req.httpRequest.protocol || "http",
            host: req.httpRequest.headers['host'],
            username: user.name,
            password: user.password
        };
        WebService.sendEvents(since, function (s) {
            connection.sendUTF(s);
        }, function () {
            connection.close();
        }, fields, -1);
    };
    WebService.onWSClose = function (connection) {
        logger.debug("onWSClose");
    };
    WebService.bodyReader = function (req, res, next) {
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
    };
    WebService.checkPinCode = function (req, res) {
        var pinCode = req.headers['x-pincode'];
        var user = di.user;
        if ((user.pinCode == null || !user.forcePinCode) && _.isUndefined(pinCode))
            return true;
        if (pinCode === user.pinCode)
            return true;
        if (pinCode == null) {
            res.status(403).send("authorization required");
            return false;
        }
        res.status(403).send("invalid pin code");
        return false;
    };
    WebService.postArmedState = function (req, res) {
        var armedState = di.service.armedStates.at(req.body);
        if (armedState == null) {
            res.status(400).send("no such armed state");
        }
        if (!WebService.checkPinCode(req, res))
            return;
        armedState.activate().then(function () {
            res.status(200).send("OK\n");
        });
    };
    WebService.postBypassSensor = function (req, res) {
        if (!WebService.checkPinCode(req, res))
            return;
        var item = di.service.armedStates.active.at(req.body);
        if (item == null) {
            res.status(400).send(util.format("unknown sensor '%s' or not armed", req.body));
            return;
        }
        di.service.armedStates.active.bypass(item);
        res.status(200).send("OK\n");
    };
    WebService.postCancelArming = function (req, res) {
        if (di.service.armedStates.prev == null) {
            res.status(400).send("no prev armed state");
            return;
        }
        if (di.service.armedStates.active.timeLeft == 0) {
            res.status(400).send("already armed");
            return;
        }
        if (!WebService.checkPinCode(req, res))
            return;
        di.service.armedStates.prev.activate().then(function () {
            res.status(200).send("OK\n");
        });
    };
    WebService.prototype.start = function () {
        var deferred = Q.defer();
        this.httpServer = this.app.listen(this.options.port, function () {
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
    };
    return WebService;
})();
exports.WebService = WebService;
//# sourceMappingURL=web_service.js.map