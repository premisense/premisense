'use strict';

angular.module('alarmt.eventLogView', ['ngRoute'])

    .config(function ($routeProvider) {
        $routeProvider.when('/account/:account/eventLog', {
            templateUrl: 'views/eventLog/eventLog.html',
            controller: 'EventLogCtrl',
            resolve: {
                asession: function ($route, $location, aservice, store) {
                    if ($route.current.params.account in store.accounts.items) {
                        return aservice.ensureSession($route.current.params.account);
                    }
                }
            }
        });
    })
    .controller('EventLogCtrl', function (asession, $timeout, $scope, $log, pinCodeDialog, ASERVICE_EVENTS) {

        $scope.severities = [
            'INFO',
            'NOTICE',
            'WARNING',
            'ALERT'
        ]

        $scope.eventLogPromise = undefined;
        $scope.eventLogModified = undefined;
        $scope.newEventLogModifiedCount = undefined;
        $scope.loadingEventLogModified = undefined;
        $scope.loading = true;

        var reloadEventLog = function () {
            if (angular.isDefined($scope.eventLogPromise)) {
                return;
            }

            $scope.loading = true;
            $scope.loadingEventLogModified = $scope.newEventLogModifiedCount;

            $scope.eventLogPromise = asession.getEventLog();
            $scope.eventLogPromise.then(function (result) {
                $scope.eventLogPromise = undefined;
                $scope.eventLogModified = $scope.loadingEventLogModified;

                // check again if we need to reload

                if ($scope.loadingEventLogModified !== $scope.newEventLogModifiedCount) {
                    reloadEventLog();
                }

                $scope.eventLog = JSON.parse(result);
                $scope.loading = false;
            }, function () {
                $scope.eventLogPromise = undefined;
                $scope.loading = false;

                $timeout(function () {
                    reloadEventLog();
                }, 5000);
            })
        };

        var updateVars = function () {
            $scope.armedState = asession.events.armedState;

            if (asession.events.eventLog != null) {
                $scope.newEventLogModifiedCount = asession.events.eventLog.modified;
            }

            if ($scope.loadingEventLogModified !== $scope.newEventLogModifiedCount) {
                reloadEventLog();
            }
        };

        $scope.$on(ASERVICE_EVENTS.modified, updateVars);

        $scope.formatMessage = function (event) {
            if (event.message === 'armed') {
                return event.data.id;
            }
            return event.message;
        }
        updateVars();

        if (false) {
            $scope.isTriggeredItems = function () {
                if ($scope.armedState != null && Object.keys($scope.armedState.triggeredItems).length > 0) {
                    return true;
                }
                return false;
            };

            $scope.bypassSensor = function (sensorId, pinCode) {
                asession.bypassSensor(sensorId, pinCode)
                    .then(function () {
                        $log.info("sensor " + sensorId + " bypassed");
                    }, function (status) {
                        if (status == 403) {
                            pinCodeDialog()
                                .result.then(function (pinCode) {
                                    $scope.bypassSensor(sensorId, pinCode);
                                });
                            return;
                        }

                        //TODO show alert with error info
                    })
            };
        }
    }
);