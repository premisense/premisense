'use strict';

angular.module('alarmt.inputBoxView', ['ui.bootstrap'])
    .factory('inputBoxDialog', ['$log', '$modal', function ($log, $modal) {
        return function (cfg) {
            var modalInstance = $modal.open({
                templateUrl: 'views/inputBox/inputBox.html',
                controller: 'InputBoxCtrl',
                keyboard: true,
                windowClass: 'inputBoxDialog xs-full-screen ' + (angular.isDefined(cfg.windowClass) ? cfg.windowClass : ''),
                size: angular.isDefined(cfg.size) ? cfg.size : 'lg',
                resolve: {
                    cfg: function () {
                        return cfg;
                    }
                }
            });
            return modalInstance;
        };
    }])
    .controller('InputBoxCtrl', function ($scope, $timeout, $window, cfg) {

        $scope.cfg = cfg;
    }
)
;
