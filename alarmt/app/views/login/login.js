'use strict';

angular.module('alarmt.loginView', ['ui.bootstrap'])
    .factory('loginDialog', ['$log', '$modal', function ($log, $modal) {
        return function () {
            var modalInstance = $modal.open({
                templateUrl: 'views/login/login.html',
                controller: 'LoginCtrl',
                backdrop: false,
                keyboard: false,
                windowClass: 'loginDialog full-screen',
                size: 'lg',
                resolve: {
                }
            });
            return modalInstance;
        };
    }])
//    .run(['$rootScope', 'AUTH_EVENTS', 'AuthService', 'loginDialog', 'appInfo', '$window',
//        function ($rootScope, AUTH_EVENTS, AuthService, loginDialog, appInfo, $window) {
//
//            if (angular.isDefined(appInfo.userName)) {
//
////                $rootScope.$on(AUTH_EVENTS.notAuthenticated, function () {
////                    loginDialog();
////                });
////
////                $rootScope.$on(AUTH_EVENTS.notAuthorized, function () {
////                    loginDialog();
////                });
//
//                AuthService.login(appInfo.userName, appInfo.password);
//                return;
//            }
//
//            $rootScope.$on(AUTH_EVENTS.notAuthorized, function () {
//                loginDialog();
//            });
//
//            if(typeof(Storage) !== "undefined") {
//                var storedUserName = $window.localStorage.userName;
//                var storedPassword = $window.localStorage.password;
//
//                if (angular.isDefined(storedUserName)) {
//                    AuthService.login(storedUserName, storedPassword);
//                    return;
//                }
//            }
//
//            loginDialog();
//
//        }])
    .controller('LoginCtrl', function ($scope, $modalInstance, $timeout, $window) {
        $scope.userName = '';
        $scope.password = '';
        $scope.rememberMe = true;

        $scope.errorMessage = '';

        $scope.$watch('userName', function () {
            $scope.errorMessage = '';
        });

        $scope.$watch('password', function () {
            $scope.errorMessage = '';
        });

        $scope.loginPromise = null;

        $scope.login = function () {
            $scope.errorMessage = '';

//TODO fixme            $scope.loginPromise = AuthService.login($scope.userName, $scope.password);
            $scope.loginPromise.then(function (err) {
                $scope.loginPromise = null;

                if (err == null) {

                    if ($scope.rememberMe && typeof(Storage) !== "undefined") {
                        $window.localStorage.userName = $scope.userName;
                        $window.localStorage.password = $scope.password;
                    }
                    $scope.$dismiss();
                    return;
                }
                $scope.errorMessage = 'Authentication failed';
            });
        }
    }
)
;
