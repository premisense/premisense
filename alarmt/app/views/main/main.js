'use strict';


angular.module('alarmt.mainView', ['ngRoute'])

    .config(function ($routeProvider) {
        $routeProvider.when('/account/:account/main', {
            templateUrl: 'views/main/main.html',
            controller: 'MainCtrl',
            resolve: {
                asession: function ($route, $location, aservice, store) {
                    if ($route.current.params.account in store.accounts.items) {
                        return aservice.ensureSession($route.current.params.account);
                    }
                }
            }
        })
    })
    .controller('MainCtrl', function ($scope, $log, pinCodeDialog, ASERVICE_EVENTS, $rootScope, asession, triggeredItemsDialog) {
        var updateVars = function () {
            $scope.armedStates = [];
            for (var k in asession.events.armedStates.states) {
                $scope.armedStates.push(asession.events.armedStates.states[k]);
            }
            $scope.armedState = asession.events.armedStates.active;


            $scope.$watch(function () {
                if (angular.isDefined($rootScope.watchSize.view) &&
                    angular.isArray($scope.armedStates) &&
                    $scope.armedStates.length > 0) {

                    return ($rootScope.watchSize.view.fullHeight / $scope.armedStates.length);
                } else {
                    // return a default value for now.
                    return 30;
                }
            }, function (newHeight) {
                $scope.buttonHeight = newHeight;
            });

        };

        $scope.triggeredItemsDialogPromise = null;

        $scope.triggeredItemsCount = function (id) {
            if ($scope.armedState != null && id === $scope.armedState.id) {
                return Object.keys($scope.armedState.triggeredItems).length;
            }
            return 0;
        };

        $scope.$on(ASERVICE_EVENTS.modified, updateVars);
        updateVars();

        $scope.arm = function (id, pinCode) {
            if (id === $scope.armedState.id) {

                if ($scope.triggeredItemsCount(id) > 0 && $scope.triggeredItemsDialogPromise == null) {
                    $scope.triggeredItemsDialogPromise = triggeredItemsDialog(asession);
                    $scope.triggeredItemsDialogPromise.result.then(function () {
                        $scope.triggeredItemsDialogPromise = null;
                    }, function () {
                        $scope.triggeredItemsDialogPromise = null;
                    })
                }
                return;
            }
            asession.arm(id, pinCode)
                .then(function () {
                    $log.info("arming completed");
                }, function (status) {
                    if (status == 403) {
                        pinCodeDialog()
                            .result.then(function (pinCode) {
                                $scope.arm(id, pinCode);
                            });
                        return;
                    }

                    //TODO show alert with error info
                })
        };
    }
);