'use strict';

angular.module('alarmt.monitorView', [
    'alarmt.sensorHistoryView',
    'ngRoute'
])
    .config(function ($routeProvider) {
        $routeProvider.when('/account/:account/monitor', {
            templateUrl: 'views/monitor/monitor.html',
            controller: 'MonitorCtrl',
            resolve: {
                asession: function ($route, $location, aservice, store) {
                    if ($route.current.params.account in store.accounts.items) {
                        return aservice.ensureSession($route.current.params.account);
                    }
                }
            }
        });
    })
    .controller('MonitorCtrl', function (asession, $scope, $rootScope, $log, $interval, sensorHistoryDialog, ASERVICE_EVENTS) {

        if (!angular.isDefined($rootScope.monitorFilterExpression)) {
            $rootScope.monitorFilterExpression = {
                name: null,
                sensors: true,
                users: false,
                groups: true,
                detected: false
            };
        }
//            $scope.monitorFilterExpression = $rootScope.monitorFilterExpression;

        $scope.now = Math.floor(new Date().getTime() / 1000);
        $scope.monitorTimer = null;
        $scope.maxHistory = 10;


        var filterObjects = function () {
            var startTime = new Date().getTime();
            var maxHistory = $scope.maxHistory;

            var exp = $rootScope.monitorFilterExpression;
            $scope.filteredObjects = [];

            var now = $scope.now;

            var name = exp.name;
            if (name !== null && name !== '') {
                name = name.toLowerCase();
            }

            if (asession.events != null) {
                var sortedObjects = asession.events.sortedObjects;
                for (var i = 0; i < sortedObjects.length; ++i) {
                    var entry = sortedObjects[i];
                    var value = asession.events.objects[entry.id];

                    if (name != null && name !== '') {
                        if (entry.lowerName.indexOf(name) < 0) {
                            continue;
                        }
                    }

                    if (value.type === 'User' || value.type === 'UserSession' || value.id === 'users') {
                        if (!exp.users) {
                            continue;
                        }
                    }
                    else if (value.type === 'Sensor') {
                        if (!exp.sensors) {
                            continue;
                        }
                        if (exp.recentlyDetected && !value.detectionHistory.isRecentlyDetected(now, maxHistory)) {
                            continue;
                        }
                    } else if (value.type === 'Group') {
                        if (!exp.groups) {
                            continue;
                        }
                        if (exp.recentlyDetected && !value.detectionHistory.isRecentlyDetected(now, maxHistory)) {
                            continue;
                        }
                    } else {
                        continue;
                    }

                    $scope.filteredObjects.push(value);
                }
            }
            var endTime = new Date().getTime();
//            $log.debug("filterObjects completed. started:" + startTime + ", elapsed: " + (endTime - startTime));

        };

        var updateVars = function () {

        };

        $scope.$on(ASERVICE_EVENTS.modified, updateVars);
        updateVars();
        filterObjects();

        $scope.cancelTimer = function () {
            if ($scope.monitorTimer != null) {
                $interval.cancel($scope.monitorTimer);
                $scope.monitorTimer = null;
            }
        };

        $scope.$on('$destroy', function () {
            $scope.cancelTimer();
        });

        $scope.isDetected = function (item, second) {
            var result = item.detectionHistory.isDetected($scope.now - second);
            return result;
        };

        $scope.isGroup = function (item) {
            return (item.type === "Group");
        };

        $scope.isUser = function (item) {
            return (item.type === "User" || item.type === "UserSession");
        };

        $scope.isSensor = function (item) {
            return (item.type === "Sensor");
        };

        $scope.sensorHistory = function (item) {
            sensorHistoryDialog(item.id);
        };

        $scope.monitorTimer = $interval(function () {
            $scope.now = Math.floor(new Date().getTime() / 1000);
            filterObjects();
        }, 500);
    }
);
