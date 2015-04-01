'use strict';

angular.module('alarmt.accountsView', [
    'ngRoute',
    'alarmt.editAccountView',
    'alarmt.inputBoxView',
    'storeModule'
])
    .factory('accountsDialog', ['$log', '$modal', function ($log, $modal) {
        return function () {
            var modalInstance = $modal.open({
                templateUrl: 'views/accounts/accounts.html',
                controller: 'AccountsCtrl',
                windowClass: 'accounts-dialog full-screen',
                size: 'lg',
                resolve: {
                }
            });
            return modalInstance;
        };
    }])
    .controller('AccountsCtrl', function ($scope, $log, pinCodeDialog, store, editAccountDialog, inputBoxDialog) {

        $scope.accounts = store.accounts;

        $scope.editingAccounts = false;
        $scope.markedAccounts = {};

        $scope.markedCount = function () {
            return Object.keys($scope.markedAccounts).length;
        }
        $scope.toggleEdit = function () {
            $scope.markedAccounts = {};
            $scope.editingAccounts = !$scope.editingAccounts;
        }

        $scope.deleteMarked = function () {
            if ($scope.markedCount() == 0) {
                return;
            }

            inputBoxDialog({
                title: 'Confirm Delete Accounts',
                message: 'You are about to delete accounts. Are you sure?',
                buttons: [
                    {id: 'yes', text: 'Yes'},
                    {id: 'no', text: 'No'}
                ],
                footerClass: 'sm-col-6'
            }).result.then(function (id) {
                    if (id === 'yes') {
                        for (var key in $scope.markedAccounts) {
                            $scope.accounts.remove(key);
                        }
                        $scope.markedAccounts = {};
                        $scope.editingAccounts = false;
                    }
                });
        }

        $scope.editAccount = function (id) {
            if ($scope.editingAccounts) {
                if (id in $scope.markedAccounts) {
                    delete $scope.markedAccounts[id];
                } else {
                    $scope.markedAccounts[id] = true;
                }
            } else {
                editAccountDialog($scope.accounts.items[id]).result.then(function (account) {
                    $scope.accounts.update(id, account);
                })
            }
        }

        $scope.addAccount = function () {
            editAccountDialog(null, $scope.accounts.size() == 0).result.then(function (account) {
                $scope.accounts.add(account);
            })
        }

        if ($scope.accounts.size() == 0) {
            $scope.addAccount();
        }
    }
);
