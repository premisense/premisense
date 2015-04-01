'use strict';

angular.module('alarmt.sensorHistoryView', ['ui.bootstrap'])

    .factory('sensorHistoryDialog', ['$log', '$modal', function ($log, $modal) {
        return function (itemId) {
            var modalInstance = $modal.open({
                templateUrl: 'views/sensorHistory/sensorHistory.html',
                controller: 'SensorHistoryCtrl',
                backdrop: false,
                keyboard: false,
                windowClass: 'sensorHistoryDialog full-screen',
                size: 'lg',
                resolve: {
                    itemId: function () {
                        return itemId;
                    },
                    asession: function ($route, $location, aservice, store) {
                        if ($route.current.params.account in store.accounts.items) {
                            return aservice.ensureSession($route.current.params.account);
                        }
                    }
                }
            });
            return modalInstance;
        };
    }])
    .controller('SensorHistoryCtrl', function (asession, $scope, $rootScope, $log, $timeout, $interval, ASERVICE_EVENTS, itemId) {
        //TODO on destructor, abort the pending promise


        $scope.sensorHistoryPromise = undefined;
        $scope.sensorHistoryModified = undefined;
        $scope.newsensorHistoryModifiedCount = undefined;
        $scope.loadingsensorHistoryModified = undefined;
        $scope.loading = true;

        var reloadSensorHistory = function () {
            if (angular.isDefined($scope.sensorHistoryPromise)) {
                return;
            }

            $scope.loading = true;
            $scope.loadingSensorHistoryModified = $scope.newSensorHistoryModifiedCount;

            $scope.sensorHistoryPromise = asession.getSensorHistory(itemId);
            $scope.sensorHistoryPromise.then(function (result) {
                $scope.sensorHistoryPromise = undefined;
                $scope.sensorHistoryModified = $scope.loadingSensorHistoryModified;

                // check again if we need to reload

                if ($scope.loadingSensorHistoryModified !== $scope.newSensorHistoryModifiedCount) {
                    reloadSensorHistory();
                }

                var sensorHistory = JSON.parse(result);

                $scope.sensorHistory = [];

                angular.forEach(sensorHistory, function(value, key) {
                    $scope.sensorHistory.push({time: parseInt(key), count: value});
                });
                $scope.sensorHistory.sort(function(a, b) {
                   return b.time - a.time;
                });

                $scope.loading = false;
            }, function () {
                $scope.sensorHistoryPromise = undefined;
                $scope.loading = false;

                $timeout(function () {
                    reloadSensorHistory();
                }, 5000);
            })
        };

        //TODO add support for auto refresh

        reloadSensorHistory();
        var updateVars = function () {
        };

        $scope.$on(ASERVICE_EVENTS.modified, updateVars);

        $scope.formatMessage = function (event) {
            if (event.message === 'armed') {
                return event.data.id;
            }
            return event.message;
        };
        updateVars();
    }
);
