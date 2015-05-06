'use strict';

// Declare app level module which depends on views, and components
angular.module('alarmt', [
    'ngRoute',
    'ngTouch',
    'alarmt.accountsView',
    'alarmt.mainView',
    'alarmt.eventLogView',
    'alarmt.monitorView',
    'alarmt.pinCodeView',
    'alarmt.loginView',
    'alarmt.wouldTriggerView',
    'alarmt.triggeredItemsView',
    'aserviceModule',
    'storeModule'
])
    .config(['$routeProvider', function ($routeProvider) {
        $routeProvider
            .otherwise({
                redirectTo: '/main'
            });
    }])
    .directive('watchSize', ['$parse', '$window', '$rootScope', function ($parse, $window, $rootScope) {
        return function (scope, element, attrs) {
            var fn = $parse(attrs.watchSize);

            if (!angular.isDefined($rootScope.watchSize)) {
                var w = angular.element($window);

                $rootScope.watchSize = {};

                scope.$watch(function () {
                    return {
                        width: w.width(),
                        fullWidth: w.width(),
                        height: w.height(),
                        fullHeight: w.height()
                    };
                }, function (size) {

                    $rootScope.watchSize.window = size;

//                    console.log("new window size: " + size.width + "," + size.height);
                }, true);

                w.bind('resize', function () {
                    scope.$apply();
                });
            }

            scope.$watch(function () {
//                debugger;
                return {
                    width: element.width(),
                    fullWidth: element.outerWidth(true),
                    height: element.height(),
                    fullHeight: element.outerHeight(true)
                };
            }, function (size) {

                fn.assign($rootScope.watchSize, size);

//                console.log("new " + attrs.watchSize + " size: " + size.width + "," + size.height);
            }, true);

        };
    }])
    .factory('appInfo', function ($log, $window) {
        var appInfo = {};

        var origUrl;

        function getQueryVariable(variable) {
            var query = $window.location.search.substring(1);
            var vars = query.split('&');
            for (var i = 0; i < vars.length; i++) {
                var pair = vars[i].split('=');
                if (decodeURIComponent(pair[0]) == variable) {
                    return decodeURIComponent(pair[1]);
                }
            }
            $log.debug('Query variable %s not found', variable);
            return undefined;
        }


        if ((typeof(HomeKiosk) != 'undefined')) {
            appInfo._playSound = function (url) {
                HomeKiosk.playSound(url);
            };
            appInfo._stopSound = function (url) {
                HomeKiosk.stopSound(url);
            };

            appInfo.kiosk = {
                origUrl: HomeKiosk.getOrigUrl()
            };
            origUrl = appInfo.kiosk.origUrl;
        } else {
            appInfo._playSound = function (url) {

            };
            appInfo._stopSound = function (url) {

            };
            origUrl = $window.location.href;
        }

        appInfo.playSound = function (url) {
            $log.debug("playing sound: "+url);
            this._playSound(url);

        };
        appInfo.stopSound = function (url) {
            $log.debug("stopping sound:" + url);
            this._stopSound(url);
        };

        var tmp = origUrl.substr($window.location.protocol.length + 2);
        tmp = tmp.substr(0, tmp.indexOf('/'));

        if (tmp.indexOf('@') >= 0) {
            var userpass = tmp.substr(0, tmp.indexOf('@')).split(':');
            appInfo.userName = userpass[0];
            appInfo.password = userpass[1];
        } else {
            var userName = getQueryVariable("userName");
            if (angular.isDefined(userName)) {
                appInfo.userName = userName;
                appInfo.password = getQueryVariable("password");

                var serverAddress = getQueryVariable("serverAddress");

                if (angular.isDefined(serverAddress) && serverAddress.indexOf("http:") !== 0 && serverAddress.indexOf("https:") !== 0) {
                    serverAddress = $window.location.protocol + "//" + serverAddress;
                    appInfo.serverAddress = serverAddress;
                }

            }
        }
        appInfo.baseUrl = $window.location.origin;

        if (appInfo.baseUrl.indexOf('?') >= 0) {
            appInfo.baseUrl = appInfo.baseUrl.substr(0, appInfo.baseUrl.indexOf('?'));
        }

        if (!angular.isDefined(appInfo.serverAddress)) {
            appInfo.serverAddress = appInfo.baseUrl;
        }

        $log.debug("starting: absUrl: " + origUrl);
        $log.debug("starting: baseUrl: " + appInfo.baseUrl);
        if (angular.isDefined(appInfo.userName)) {
            $log.debug("starting: userName: " + appInfo.userName);
        }

        return appInfo;
    })
    .controller('AppCtrl',
    function ($log, $rootScope, aservice, $scope, $route, $http, $timeout, $interval, $location, wouldTriggerDialog, accountsDialog, ASERVICE_EVENTS, appInfo, store) {

        $scope.accounts = store.accounts;

        var updateVars = function () {
            $scope.accountId = angular.isDefined(aservice.session) ? aservice.session.account.id : undefined;
            $scope.accountName = angular.isDefined(aservice.session) ? aservice.session.account.name : undefined;

            $scope.hasSession = angular.isDefined(aservice.session);
            $scope.armedState = angular.isDefined(aservice.session) ? aservice.session.events.armedStates.active : null;
            $scope.sirenState = angular.isDefined(aservice.session) ? aservice.session.events.sirenState : null;

            var play;


            if (!angular.isDefined(play) &&
                $scope.sirenState !== null &&
                $scope.sirenState.active &&
                $scope.armedState !== null &&
                $scope.armedState.metadata !== null) {

                var sirenSound = $scope.armedState.metadata.sirenSound;
                if (angular.isDefined(sirenSound) && sirenSound !== null) {
                    play = sirenSound;
                }
            }

            if (!angular.isDefined(play) &&
                $scope.sirenState !== null &&
                !$scope.sirenState.active &&
                $scope.sirenState.timeLeft > 0 &&
                $scope.armedState !== null &&
                $scope.armedState.metadata !== null) {

                var warningSound = $scope.armedState.metadata.warningSound;
                if (angular.isDefined(warningSound) && warningSound !== null) {
                    play = warningSound;
                }
            }

            if (!angular.isDefined(play) &&
                $scope.armedState !== null &&
                $scope.armedState.armingTimeLeft > 0 &&
                $scope.armedState.metadata !== null) {
                var armingSound = $scope.armedState.metadata.armingSound;
                if (angular.isDefined(armingSound) && armingSound !== null) {
                    play = armingSound;
                }
            }

            if ($scope.activeSound != play) {
                if (angular.isDefined(play) && play !== null) {
                    appInfo.playSound(play);
                } else {
                    appInfo.stopSound($scope.activeSound);
                }
                $scope.activeSound = play;
            }
        };

        $scope.formatAccountPath = function (accountId, path) {
            return "/account/" + accountId + "/" + path;
        };

        $scope.formatPath = function (path) {
            if (angular.isDefined($scope.accountId)) {
                return $scope.formatAccountPath($scope.accountId, path);
            }
            return "";
        };

        $scope.setActiveView = function (path) {
            if (angular.isDefined($scope.accountId)) {
                $location.path($scope.formatPath(path));
            }
        };

        $scope.isActive = function (path) {
            return ($location.path() === $scope.formatPath(path));
        };

        $scope.activeSound = null;

        $scope.wouldTriggerDialogPromise = null;


        $scope.$on(ASERVICE_EVENTS.modified, updateVars);
        $scope.$on(ASERVICE_EVENTS.newSession, updateVars);

        updateVars();

        $scope.$watch('armedState.wouldTriggerItems', function () {
            if ($scope.wouldTriggerDialogPromise === null &&
                $scope.armedState !== null &&
                $scope.armedState.armingTimeLeft > 0 &&
                Object.keys($scope.armedState.wouldTriggerItems).length > 0) {

                $scope.wouldTriggerDialogPromise = wouldTriggerDialog(aservice.session);
                $scope.wouldTriggerDialogPromise.result.then(function () {
                    $scope.wouldTriggerDialogPromise = null;
                }, function () {
                    $scope.wouldTriggerDialogPromise = null;
                });
            }
        });

        $scope.$watch('sirenState.active', function (newValue, oldValue) {
            // to avoid switching to the main view when just starting the app, we check the old value
            if (angular.isDefined(oldValue) && $scope.sirenState.active === true) {
                $scope.setActiveView('main');
            }
        });

        $scope.$watch('armedState.name', function (newValue, oldValue) {
            // to avoid switching to the main view when just starting the app, we check the old value
            if (angular.isDefined(oldValue)) {
                $scope.setActiveView('main');
            }
        });

        $scope.activateWouldTrigger = function () {
            wouldTriggerDialog()
                .result.then(function (pinCode) {
//                        debugger;
                }, function () {
//                        debugger;
                })
            ;
        };

        $scope.currentAccount = function () {
            if (angular.isDefined($scope.accountName)) {
                return $scope.accountName;
            }
            return "???";
        };

        $scope.isKiosk = angular.isDefined(appInfo.kiosk);
        $scope.showSidebar = !angular.isDefined(appInfo.kiosk) && !angular.isDefined(appInfo.userName);
        $scope.sidebar = false;
        $scope.activateSidebar = function () {
            $scope.sidebar = true;
        };

        $scope.isConnected = function () {
            return aservice.isConnected();
        };

        $scope.manageAccounts = function () {
            $scope.sidebar = false;
            accountsDialog();
        };

        $scope.connectAccount = function (id) {
            $scope.sidebar = false;
            $location.path($scope.formatAccountPath(id, "main"));
        };

        if ($scope.accounts.size() === 0) {
            accountsDialog();
        } else if (!angular.isDefined($scope.accountId)) {
            if (!angular.isDefined(aservice.pendingAccountId())) {
                var lastAccountId = store.accounts.lastAccountId;
                if (angular.isDefined(lastAccountId) && lastAccountId in store.accounts.items) {
                    $scope.connectAccount(lastAccountId);
                } else {
                    var minAccountId;
                    for (var id in store.accounts.items) {
                        if (!angular.isDefined(minAccountId) || minAccountId > id) {
                            minAccountId = id;
                        }
                    }
                    $scope.connectAccount(minAccountId);
                }
            }
        }
        $log.info("Starting App Controller Poller");

    });

/*
 var pushNotification = null;

 document.addEventListener('deviceready', onDeviceReady, false);

 function onDeviceReady() {
 console.log("deviceready event received");

 //    $("#app-status-ul").append('<li>deviceready event received</li>');
 //
 //    document.addEventListener("backbutton", function (e) {
 //        $("#app-status-ul").append('<li>backbutton event received</li>');
 //
 //        if ($("#home").length > 0) {
 //            // call this to get a new token each time. don't call it to reuse existing token.
 //            //pushNotification.unregister(successHandler, errorHandler);
 //            e.preventDefault();
 //            navigator.app.exitApp();
 //        }
 //        else {
 //            navigator.app.backHistory();
 //        }
 //    }, false);

 try {
 console.log("platform: " + device.platform);
 pushNotification = window.plugins.pushNotification;

 if (device.platform == 'android' || device.platform == 'Android' || device.platform == 'amazon-fireos') {
 pushNotification.register(successHandler,
 errorHandler,
 {"senderID": "661780372179", "ecb": "onNotification"});
 } else {
 pushNotification.register(tokenHandler,
 errorHandler,
 {"badge": "true", "sound": "true", "alert": "true", "ecb": "onNotificationAPN"});
 }
 }
 catch (err) {
 var txt = "There was an error on this page.\n\n";
 txt += "Error description: " + err.message + "\n\n";
 alert(txt);
 }
 }

 // handle APNS notifications for iOS
 function onNotificationAPN(e) {
 if (e.alert) {
 // showing an alert also requires the org.apache.cordova.dialogs plugin
 navigator.notification.alert(e.alert);
 }

 if (e.sound) {
 // playing a sound also requires the org.apache.cordova.media plugin
 var snd = new Media(e.sound);
 snd.play();
 }

 if (e.badge) {
 pushNotification.setApplicationIconBadgeNumber(successHandler, errorHandler, 4);
 }
 }

 // handle GCM notifications for Android
 function onNotification(e) {
 console.log("GCP notification: " + e.event);

 switch (e.event) {
 case 'registered':
 if (e.regid.length > 0) {
 // Your GCM push server needs to know the regID before it can push to this device
 // here is where you might want to send it the regID for later use.
 console.log("regID = " + e.regid);
 }
 break;

 case 'message':
 // if this flag is set, this notification happened while we were in the foreground.
 // you might want to play a sound to get the user's attention, throw up a dialog, etc.
 if (e.foreground) {

 // on Android soundname is outside the payload.
 // On Amazon FireOS all custom attributes are contained within payload
 var soundfile = e.soundname || e.payload.sound;
 // if the notification contains a soundname, play it.
 // playing a sound also requires the org.apache.cordova.media plugin
 var my_media = new Media("/android_asset/www/" + soundfile);

 my_media.play();
 }
 else {	// otherwise we were launched because the user touched a notification in the notification tray.
 if (e.coldstart)
 console.log('--COLDSTART NOTIFICATION--');
 else
 console.log('--BACKGROUND NOTIFICATION--');
 }

 console.log('MESSAGE -> MSG: ' + e.payload.message);
 //android only
 console.log('MESSAGE -> MSGCNT: ' + e.payload.msgcnt);
 //amazon-fireos only
 console.log('MESSAGE -> TIMESTAMP: ' + e.payload.timeStamp);
 break;

 case 'error':
 console.log('ERROR -> MSG:' + e.msg);
 break;

 default:
 console.log('EVENT -> Unknown, an event was received and we do not know what it is');
 break;
 }
 }

 function tokenHandler(result) {
 console.log('token: ' + result);
 // Your iOS push server needs to know the token before it can push to this device
 // here is where you might want to send it the token for later use.
 }

 function successHandler(result) {
 console.log('success:' + result);
 }

 function errorHandler(error) {
 console.log('error:' + error);
 }

 */