'use strict';

var storeModule = angular.module('storeModule', []);

storeModule
    .constant('STORE_EVENTS', {
        modified: 'store-modified'
    })
    .factory('store', function ($log, $q, $window, appInfo, STORE_EVENTS) {

        var Account = function (name, serverAddress, userName, password) {
            this.name = name;
            this.serverAddress = serverAddress;
            this.userName = userName;
            this.password = password;
        };

        var Accounts = function () {
            this.items = {};

            this.size = function () {
                return Object.keys(this.items).length;
            };

            this.add = function (account) {
                if (!angular.isDefined(account.id) || account.id === null) {
                    for (var i = 0; i < 10000; ++i) {
                        if (!(i in this.items)) {
                            account.id = "" + i;
                            break;
                        }
                    }
                }

                if (account.id in this.items) {
                    throw "account already exists";
                }

                this.items[account.id] = account;

                this.store();
            };

            this.update = function (id, account) {
                account.id = id;
                this.items[id] = account;
                this.store();
            };
            this.remove = function (account) {
                if (angular.isObject(account)) {
                    delete this.items[account.id];
                } else {
                    delete this.items["" + account];
                }
                this.store();
            };

            this.updateLastAccountId = function(id) {
                this.lastAccountId = id;
                this.store();
            };

            this.load = function () {
                if (angular.isDefined(appInfo.userName)) {
                    this.items = {
                        "0": {
                            name: "Home",
                            serverAddress: appInfo.serverAddress,
                            userName: appInfo.userName,
                            password: appInfo.password,
                            id: "0"
                        }
                    };
                    this.lastAccountId = 0;
                } else {
                    var s = $window.localStorage.getItem("AlarmT_accounts");
                    if (angular.isDefined(s)) {
                        var accounts = JSON.parse(s);
                        if (angular.isDefined(accounts) && angular.isObject(accounts)) {
                            this.items = accounts;
                        }
                    }

                    this.lastAccountId = $window.localStorage.getItem("AlarmT_lastAccountId");
                }
            };

            this.store = function () {
                if (angular.isDefined(appInfo.userName)) {
                    $log.error("accounts cannot be stored when used as url");
                    return;
                }

                var s = JSON.stringify(this.items);
                $window.localStorage.setItem("AlarmT_accounts", s);

                if (angular.isDefined (this.lastAccountId)) {
                    $window.localStorage.setItem("AlarmT_lastAccountId", this.lastAccountId);
                }
            };

            this.lastAccountId = undefined;

            this.load();
        };

        var obj = {
            Account: Account,
            accounts: new Accounts()
        };

        return obj;
    }
)
;
