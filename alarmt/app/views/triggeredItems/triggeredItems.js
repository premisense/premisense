'use strict';

angular.module('alarmt.triggeredItemsView', ['ui.bootstrap'])
    .factory('triggeredItemsDialog', ['$log', '$modal', function ($log, $modal) {
        return function (asession) {
            var modalInstance = $modal.open({
                templateUrl: 'views/triggeredItems/triggeredItems.html',
                controller: 'TriggeredItemsCtrl',
                windowClass: 'triggered-items-dialog xs-full-screen',
                size: 'lg',
                resolve: {
                    asession: function(){
                        return asession;
                    }
                }
            });
            return modalInstance;
        };
    }])
    .controller('TriggeredItemsCtrl', function ($scope, $log, $modalInstance, $timeout, asession, pinCodeDialog, ASERVICE_EVENTS) {

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
                        return;
                    }

                    //TODO show alert with error info
                })
        };

        $scope.$watch('armedState.triggeredItems', function () {
            if ($scope.armedState != null && Object.keys($scope.armedState.triggeredItems).length == 0) {
                $scope.$dismiss();
            }
        });
    }
);
