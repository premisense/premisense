'use strict';

angular.module('alarmt.editAccountView', ['ui.bootstrap'])
    .factory('editAccountDialog', ['$log', '$modal', function ($log, $modal) {
        return function (account, force) {
            var modalInstance = $modal.open({
                templateUrl: 'views/editAccount/editAccount.html',
                controller: 'EditAccountCtrl',
                backdrop: false,
                keyboard: false,
                windowClass: 'editAccountDialog full-screen',
                size: 'lg',
                resolve: {
                    account: function () {
                        return account;
                    },
                    force: function () {
                        return force;
                    }
                }
            });
            return modalInstance;
        };
    }])
    .directive('serverAddressValidator', function ($http, $q) {
        return {
            require: 'ngModel',
            link: function (scope, element, attrs, ngModel) {
                ngModel.$asyncValidators.serverAddressValidator = function (modelValue, viewValue) {
                    var s = scope;
                    var def = $q.defer();

                    $http.get(viewValue + '/')
                        .success(function (response, status) {
                            if (response === "OK\n") {
                                console.log("serverAddressValidator succeeded");
                                //s.editAccountForm.userName.$validate();
                                //s.editAccountForm.password.$validate();
                                def.resolve ();
                            } else {
                                console.log("serverAddressValidator failed: response:" + response);
                                def.reject ();
                            }
                        })
                        .error(function (data, status) {
                            console.log("serverAddressValidator failed: " + status);
                            def.reject ();
                        });
                    return def.promise;
                };
            }
        };
    })
    .directive('loginValidator', function ($http, $q) {
        return {
            require: 'ngModel',
            link: function (scope, element, attrs, ngModel) {
                var serverAddress;
                var password;

                attrs.$observe('serverAddress', function(value) {
                    serverAddress = value;
                    ngModel.$validate();
                });

                attrs.$observe('password', function(value) {
                    password = value;
                    ngModel.$validate();
                });

                ngModel.$asyncValidators.loginValidator = function (modelValue, viewValue) {
                    var s = scope;
                    var def = $q.defer();

                    var userName = viewValue; //s.editAccountForm.userName.$viewValue

                    $http
                        .get(serverAddress + '/login', {
                            headers: {
                                'Authorization': 'Basic ' + btoa(userName + ':' + password)
                            },
                            timeout: 2000
                        })
                        .success(function () {
                            console.log("loginValidator succeeded");
                            s.editAccountForm.userName.$setValidity("loginValidator", true);
                            s.editAccountForm.password.$setValidity("loginValidator", true);
                            def.resolve();
                        })
                        .error(function (data, status) {
                            console.log("loginValidator failed: " + status);
                            def.reject ();
                        });
                    return def.promise;
                };
            }
        };
    })
    .directive('uniqueAccountValidator', function ($http, $q, store) {
        return {
            require: 'ngModel',
            link: function (scope, element, attrs, ngModel) {
                ngModel.$validators.uniqueAccountValidator = function (modelValue, viewValue) {
                    var valid = true;
                    angular.forEach (store.accounts.items, function(account, accountId) {
                       if (account.name === viewValue && accountId != scope.accountId) {
                           valid = false;
                       }
                    });
                    return valid;
                };
            }
        };
    })
    .controller('EditAccountCtrl', function ($scope, $modalInstance, $timeout, $window, store, account, force) {

        $scope.force = force;


        if (account == null) {
            $scope.accountId = -1;
        } else {
            $scope.accountId = account.id;
            $scope.accountName = account.name;
            $scope.serverAddress = account.serverAddress;
            $scope.userName = account.userName;
            $scope.password = account.password;
        }
        $scope.addUpdateAccount = function () {
            if (!$scope.editAccountForm.$valid) {
                return;
            }
            var newAccount = new store.Account($scope.accountName, $scope.serverAddress, $scope.userName, $scope.password);
            $scope.$close(newAccount);
        }
    }
)
;
