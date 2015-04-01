'use strict';

var aserviceModule = angular.module('aserviceModule', [
    'storeModule'
]);

aserviceModule
    .constant('ASERVICE_EVENTS', {
        newSession: 'aservice-new-session',
        modified: 'aservice-modified',
        initialized: 'aservice-initialized'
    })
    .factory('aservice',
    function ($http, $timeout, $log, $q, $rootScope, $window, ASERVICE_EVENTS, store) {
        var eventsRetryInterval = 10000;
        var detectionMaxHistory = 30; // seconds
        var maxCachePinCodeTime = 60; // seconds

        var DetectionHistory = function () {
            var latestItem;
            this.history = [];
            this.update = function (detected, now) {
                this.history.splice(0, this.history.length - detectionMaxHistory);
                if (detected) {
                    if (this.history.length > 0) {
                        latestItem = this.history[this.history.length - 1];
                        if (latestItem [1] + 1 >= now) {
                            latestItem [1] = Number.MAX_VALUE;
                            return;
                        }
                    }

                    this.history.push([now, Number.MAX_VALUE]);
                } else {
                    if (this.history.length === 0) {
                        return;
                    }
                    latestItem = this.history[this.history.length - 1];
                    if (latestItem [1] == Number.MAX_VALUE) {
                        latestItem [1] = now;
                    }
                }
            };

            this.isDetected = function (time) {
                var minIndex = 0;
                var maxIndex = this.history.length - 1;
                var currentIndex;
                var currentElement;

                while (minIndex <= maxIndex) {
                    currentIndex = (minIndex + maxIndex) / 2 | 0;
                    currentElement = this.history[currentIndex];

                    if (currentElement[1] < time) {
                        minIndex = currentIndex + 1;
                    }
                    else if (currentElement[0] > time) {
                        maxIndex = currentIndex - 1;
                    }
                    else {
                        return true;
                    }
                }
                return false;
            };
            this.isRecentlyDetected = function (now, maxHistory) {
                if (this.history.length === 0) {
                    return false;
                }

                return this.history[this.history.length - 1][1] >= now - maxHistory;
            };
        };


        var Events = function (session, timeout) {
            var self = this;
            var eventsUrl = session.account.serverAddress + '/events';

            this.now = null;
            this.initialized = false;
            this.eventsSyncPoint = null;
            this.objects = {};
            this.sortedObjects = [];
            this.eventsTimer = null;
            this.armedStatesEvent = null;
            this.armedStates = {
                activeId: null,
                active: null,
                states: {}
            };
            this.eventLog = null;
            //this.siren = null;
            this.detectedSensors = {};

            var webSocket = {
                connection: undefined,
                opened: false,
                enabled: -1
            };

            this.processEvent = function (s) {
                var event = JSON.parse(s);


                if (!angular.isDefined(event.name)) {
                    event.name = event.id;
                }

                var oldEvent = null;
                event.lowerName = event.name.toLowerCase();
                if (event.id in this.objects) {
                    oldEvent = this.objects[event.id];
                }
                this.objects[event.id] = event;

                if (event.type == "NOP") {
                    this.eventsSyncPoint = event.syncValue;

                } else if (event.type === "Sensor" || event.type === "UserSession") {
                    if (oldEvent !== null) {
                        event.detectionHistory = oldEvent.detectionHistory;
                    } else {
                        event.detectionHistory = new DetectionHistory();
                    }
                    event.detectionHistory.update((event.detected === true), this.now);

                    if (event.detected === true) {
                        this.detectedSensors[event.id] = {
                            name: event.name,
                            timestamp: this.now
                        };
                    } else {
                        delete this.detectedSensors[event.id];
                    }
                } else if (event.type === "Group" || event.type === "User") {
                    if (oldEvent !== null) {
                        event.detectionHistory = oldEvent.detectionHistory;
                    } else {
                        event.detectionHistory = new DetectionHistory();
                    }
                    event.detectionHistory.update((event.detected.length > 0), this.now);

                } else if (event.type == "ArmedStates") {
                    this.armedStatesEvent = event;
                    this.armedStates.activeId = event.active;
                    //
                    //for (var i = 0; i < event.states.length; ++i) {
                    //    var state = event.states[i];
                    //    this.armedStateNames.push(state);
                    //
                        //if (false) {
                        //    var state1 = angular.copy(state);
                        //    state1.id = state1.id + "1";
                        //    state1.name = state1.name + "1";
                        //    this.armedStates.push(state1);
                        //}
                    //}


                } else if (event.type == "ArmedState") {
                    this.armedStates.states[event.id] = event;

                    for (var k in event.bypassedItems) {
                        if (k in event.wouldTriggerItems) {
                            delete event.wouldTriggerItems[k];
                        }
                        if (k in event.triggeredItems) {
                            delete event.triggeredItems[k];
                        }
                    }
                } else if (event.type == "SirenState") {
                    this.sirenState = event;
                } else if (event.type == "EventLog") {
                    this.eventLog = event;
                }

            };

            this.cancelTimer = function () {
                if (this.eventsTimer !== null) {
                    $timeout.cancel(this.eventsTimer);
                    this.eventsTimer = null;
                }
            };

            this.rescheduleEvents = function (timeout) {
                this.cancelTimer();
                var self = this;
                this.eventsTimer = $timeout(function () {
                    self.processEvents();
                }, timeout);
            };

            this.processChunk = function (data, completed) {


                if (self.eventsSyncPoint === null) {
                    self.objects = {};
                    self.sortedObjects = [];
                }

                try {
                    self.now = Math.floor(new Date().getTime() / 1000);

                    var lines = data.split('\n');
                    for (var index = 0; index < lines.length; index++) {
                        try {
                            if (lines[index].length > 0)
                                self.processEvent(lines[index]);
                        } catch (e) {
                            $log.error("processEvent(" + lines[index] + ") failed. error:" + e);
                        }
                    }

                } catch (e) {
                    $log.error("processEvent failed. error:" + e);
                }

                self.armedStates.active = self.armedStates.states[self.armedStates.activeId];

                if (self.sortedObjects.length != Object.keys(self.objects).length) {
                    for (var k in self.objects) {
                        var event = self.objects[k];
                        self.sortedObjects.push({lowerName: event.lowerName, id: event.id});
                    }
                    self.sortedObjects.sort(function (a, b) {
                        return a.lowerName.localeCompare(b.lowerName);
                    });
                }

                if (angular.isDefined(self.eventsSyncPoint) && self.eventsSyncPoint !== null) {
                    if (!self.initialized) {
                        $rootScope.$broadcast(ASERVICE_EVENTS.initialized, session);
                        self.initialized = true;
                    }

                    $rootScope.$broadcast(ASERVICE_EVENTS.modified, session);
                }

                if (completed) {
                    self.rescheduleEvents(0);
                }

            };

            this.processHttpEvents = function () {
                var url = eventsUrl + '?maxSize=1';

                if (this.eventsSyncPoint !== null) {
                    url += "&since=" + this.eventsSyncPoint;
                }

                var http;
                http = $http({
                    url: url,
                    method: 'GET',
                    headers: {
                        'Authorization': 'Basic ' + btoa(session.account.userName + ':' + session.account.password)
                    },
                    timeout: angular.isObject(timeout) ? timeout.promise : undefined,
                    transformResponse: function (value) {
                        return value;
                    }
                });

                http.success(function (data) {
                    self.processChunk(data, true);
                });
                http.error(function (data, status, headers, config) {
                    $log.debug("get events failed. url:" + url + ". error:" + status);


                    self.eventsSyncPoint = null;
                    self.rescheduleEvents(eventsRetryInterval);
                });
            };

            this.processWebSocketEvents = function () {
                var websocketEventsUrl;

                if (eventsUrl.substr(0, 5) == 'http:') {
                    websocketEventsUrl = 'ws:' + eventsUrl.substr(5);
                } else if (eventsUrl.substr(0, 6) == 'https:') {
                    websocketEventsUrl = 'wss:' + eventsUrl.substr(6);
                } else {
                    $log.error("unknown eventsUrl");
                    throw "unknown eventsUrl";
                }

                var url = websocketEventsUrl + '?maxSize=-1';
                url = url + "&authorization=" + encodeURIComponent('Basic ' + btoa(session.account.userName + ':' + session.account.password));

                $log.debug("connecting to websocket. url:" + url);

                webSocket.connection = new $window.WebSocket(url, ['events']);

                $log.debug("websocket object created");

                var detectWebSocketTimeout;
                // unknown yet
                if (webSocket.enabled == -1) {
                    detectWebSocketTimeout = $timeout(function () {
                        $log.debug("websocket: fail back to http long-polling");
                        webSocket.connection = undefined;
                        webSocket.enabled = 0;

                        self.processHttpEvents();

                    }, 3000);
                }

                var cancelWebSocketTimeout = function() {
                    if (angular.isDefined(detectWebSocketTimeout)) {
                        $timeout.cancel(detectWebSocketTimeout);
                        detectWebSocketTimeout = undefined;
                    }
                };

                webSocket.connection.onopen = function () {
                    $rootScope.$apply(function () {
                        $log.debug("websocket connection opened");

                        webSocket.opened = true;
                    });
                };
                webSocket.connection.onerror = function (error) {
                    $rootScope.$apply(function () {
                        $log.debug("websocket connect failed");

                        cancelWebSocketTimeout();

                        try {
                            webSocket.connection.close();
                        } catch (e) {
                            //ignore
                        }
                        webSocket.connection = undefined;
                        self.rescheduleEvents(eventsRetryInterval);
                    });
                };
                webSocket.connection.onmessage = function (msg) {
                    webSocket.enabled = 1;
                    $rootScope.$apply(function () {

                        cancelWebSocketTimeout();

                        self.processChunk(msg.data, false);
                    });
                };
                webSocket.connection.onclose = function () {
                    $log.debug("websocket connect closed");

                    cancelWebSocketTimeout();

                    webSocket.connection = undefined;
                    self.rescheduleEvents(eventsRetryInterval);
                };

                timeout.promise.then(function () {
                    $rootScope.$apply(function () {
                        if (angular.isDefined(webSocket.connection)) {
                            try {
                                webSocket.connection.close();
                            } catch (e) {
                                //ignore
                            }
                            webSocket.connection = undefined;
                        }
                    });
                });
            };

            this.processEvents = function () {
                if (webSocket.enabled != 0) {

                    if (!angular.isDefined($window.WebSocket)) {
                        $log.debug("websocket is not available");
                        webSocket.enabled = 0;
                    }
                }

                if (webSocket.enabled != 0) {
                    if (angular.isDefined(webSocket.connection)) {
                        $log.error("invalid state. prev websocket connection is still open");
                    }
                    this.processWebSocketEvents();
                } else {
                    this.processHttpEvents();
                }
            };

            this.processEvents();
        };

        var Session = function (account) {
            var session = this;

            this.account = account;

            var timeout = $q.defer();

            this.events = new Events(session, timeout);

            //TODO do we need this method
            var ensureActive = function () {
//                    debugger;
            };

            var lastPinCode = {
                value: null,
                time: 0
            };

            var doPost = function (url, data, pinCode) {

                var deferred = $q.defer();
                var cfg = {
                    url: url,
                    method: 'POST',
                    data: data,
                    timeout: angular.isObject(timeout) ? timeout.promise : undefined,
                    headers: {
                        'Authorization': 'Basic ' + btoa(session.account.userName + ':' + session.account.password)
                    },
                    transformResponse: function (value) {
                        return value;
                    }
                };

                var now = Math.floor(new Date().getTime() / 1000);

                var tmpPinCode = pinCode;
                if (!angular.isDefined(tmpPinCode) && lastPinCode.value !== null && now - lastPinCode.time <= maxCachePinCodeTime) {
                    tmpPinCode = lastPinCode.value;
                }

                if (tmpPinCode !== null) {
                    cfg.headers['x-pincode'] = tmpPinCode;
                }

                $http(cfg).success(function (data) {
                    if (tmpPinCode !== null) {
                        lastPinCode.value = tmpPinCode;
                        lastPinCode.time = now;
                    }
                    deferred.resolve();
                }).error(function (data, status, headers, config) {
                    deferred.reject(status);
                });

                return deferred.promise;
            };

            var doGet = function (url) {

                var cfg = {
                    url: url,
                    method: 'GET',
                    timeout: angular.isObject(timeout) ? timeout.promise : undefined,
                    headers: {
                        'Authorization': 'Basic ' + btoa(session.account.userName + ':' + session.account.password)
                    },
                    transformResponse: function (value) {
                        return value;
                    }
                };

                return $http(cfg);
            };

            this.arm = function (id, pinCode) {
                ensureActive();
                return doPost(account.serverAddress + '/armed_state', id, pinCode);
            };
            this.bypassSensor = function (id, pinCode) {
                ensureActive();
                return doPost(account.serverAddress + '/bypass_sensor', id, pinCode);
            };
            this.getEventLog = function () {
                ensureActive();
                var result = doGet(account.serverAddress + '/event_log');
                var deferred = $q.defer();
                result
                    .success(function (data) {
                        deferred.resolve(data);
                    })
                    .error(function (data) {
                        deferred.reject(data);
                    });
                return deferred.promise;
            };
            this.getSensorHistory = function (id) {
                ensureActive();
                var result = doGet(account.serverAddress + '/sensor_history.json?item=' + id);
                var deferred = $q.defer();
                result
                    .success(function (data) {
                        deferred.resolve(data);
                    })
                    .error(function (data) {
                        deferred.reject(data);
                    });
                return deferred.promise;
            };
            this.isConnected = function () {
                ensureActive();
                if (this.events === null) {
                    return false;
                }
                return (this.events.eventsSyncPoint !== null);
            };
            this.cancelArming = function (pinCode) {
                ensureActive();
                return doPost(account.serverAddress + '/cancel_arming', '', pinCode);
            };
        };

        // in order to deal with multiple concurrent requests to create a new session,
        // we keep the last deferred session request.
        // if there is a pending session request, we reject it first and create a new one.
        var deferredSession = {
            timeout: null,
            accountId: undefined
        };

        var obj = {
            session: undefined,
            isConnected: function () {
                return angular.isDefined(this.session) && this.session.isConnected();
            },
            isAccount: function (accountId) {
                return angular.isDefined(this.session) && this.session.account.id === accountId;
            },
            pendingAccountId: function () {
                return deferredSession.accountId;
            },
            createSession: function (accountId) {
                // if there is an pending session, reject it first
                if (deferredSession.timeout !== null) {
                    deferredSession.timeout.resolve("rejecting due to a new session");
                    deferredSession.timeout = null;
                    deferredSession.accountId = undefined;
                }

                // if we already have an existing session, we reject it as well before creating the new one.
                if (angular.isDefined(this.session)) {
                    delete this.session;
                    this.session = undefined;
                }

                var account = store.accounts.items[accountId];
                if (!angular.isDefined(account)) {
                    throw "no such account";
                }
                store.accounts.updateLastAccountId(accountId);

                var deferred = $q.defer();

                var timeout = $q.defer();

                deferredSession.timeout = timeout;
                deferredSession.accountId = accountId;

                $http
                    .get(account.serverAddress + '/login', {
                        headers: {
                            'Authorization': 'Basic ' + btoa(account.userName + ':' + account.password)
                        },
                        timeout: timeout.promise
                    })

                    .success(function () {
                        $log.info("login completed successfully");

                        // completed. remove the pending request
                        deferredSession.timeout = null;
                        deferredSession.accountId = undefined;

                        var newSession = new Session(account);

                        $rootScope.$on(ASERVICE_EVENTS.initialized, function (event, session) {
                            if (newSession == session) {
                                //TODO temporary delay to test Loading page. play with the timeout below
                                $timeout(function () {
                                    obj.session = newSession;

                                    $rootScope.$broadcast(ASERVICE_EVENTS.newSession, newSession);
                                    deferred.resolve(obj.session);
                                }, 0);
                            }
                        });
                    })
                    .error(function (err) {
                        //TODO fixme
                        deferred.reject(err);
                    });

                return deferred.promise;
            },
            ensureSession: function (accountId) {
                if (this.isAccount(accountId)) {
                    return this.session;
                }

                var deferred = $q.defer();
                var result = this.createSession(accountId);
                result.then(function (session) {
                    deferred.resolve(session);
                });
                return deferred.promise;
            }

        };

//            $rootScope.$on(AUTH_EVENTS.loginSuccess, function() {
//                obj.events = new Events();
//                $rootScope.$broadcast(ASERVICE_EVENTS.modified);
//            });

        //TODO on logout, reset data and stop all background activity
        return obj;
    }
)
    .factory('aserviceSession', function ($q, $rootScope, aservice, ASERVICE_EVENTS) {
        if (angular.isDefined(aservice.session)) {
            return aservice.session;
        }

        var deferred = $q.defer();

        $rootScope.$on(ASERVICE_EVENTS.newSession, function () {
            deferred.resolve(aservice.session);
        });

        return deferred.promise;
    })
;
