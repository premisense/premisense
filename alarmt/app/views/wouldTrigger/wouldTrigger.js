'use strict';

angular.module('alarmt.wouldTriggerView', ['ui.bootstrap'])
    .factory('wouldTriggerDialog', ['$log', '$modal', function ($log, $modal) {
        return function (asession) {
            var modalInstance = $modal.open({
                templateUrl: 'views/wouldTrigger/wouldTrigger.html',
                controller: 'WouldTriggerCtrl',
                windowClass: 'would-trigger-dialog xs-full-screen',
                size: 'sm',
                resolve: {
                    asession: function(){
                        return asession;
                    }
                }
            });
            return modalInstance;
        };
    }])
    .controller('WouldTriggerCtrl', function ($scope, $log, $modalInstance, $timeout, asession, pinCodeDialog, ASERVICE_EVENTS) {

        var updateVars = function () {
            $scope.armedState = asession.events.armedStates.states[asession.events.armedStates.activeId];
        };

        $scope.$on(ASERVICE_EVENTS.modified, updateVars);
        updateVars();

        $scope.sensorName = function(sensorId) {
            return asession.events.objects[sensorId].name;
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
                    }

                    //TODO show alert with error info
                })
        };

        $scope.cancelArming = function (pinCode) {
            asession.cancelArming(pinCode)
                .then(function () {
                    $log.info("arming cancelled");
                }, function (status) {
                    if (status == 403) {
                        pinCodeDialog()
                            .result.then(function (pinCode) {
                                $scope.cancelArming(pinCode);
                            });
                    }

                    //TODO show alert with error info
                })
        };

        $scope.$watch('armedState.wouldTriggerItems', function () {
            if ($scope.armedState != null && Object.keys($scope.armedState.wouldTriggerItems).length == 0) {
                $scope.$dismiss();
            }
        });

        $scope.$watch('armedState.armingTimeLeft', function () {
            if ($scope.armedState != null && $scope.armedState.armingTimeLeft == 0) {
                $scope.$dismiss();
            }
        });

    }
);
