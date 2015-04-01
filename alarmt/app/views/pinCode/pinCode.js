'use strict';

angular.module('alarmt.pinCodeView', ['ui.bootstrap'])
    .factory('pinCodeDialog', ['$log', '$modal', function ($log, $modal) {
        return function () {
            var modalInstance = $modal.open({
                templateUrl: 'views/pinCode/pinCode.html',
                controller: 'PinCodeCtrl',
                size: 'sm',
                windowClass: 'pinCodeDialog',
                resolve: {
                }
            });
            return modalInstance;
        };
    }])
    .controller('PinCodeCtrl', ['$scope', '$modalInstance', '$timeout', function ($scope, $modalInstance, $timeout) {
        $scope.pin_code = '';

//        $scope.$dismiss = function(){
//            debugger;
//            $modalInstance.dismiss();
//        };

        $scope.delPinCode = function (char) {
            if ($scope.pin_code.length > 0 && $scope.pin_code.length < 4) {
                $scope.pin_code = $scope.pin_code.substr(0, $scope.pin_code.length-1);
            }
        };

        $scope.appendPinCode = function (char) {
            if ($scope.pin_code.length < 4) {
                $scope.pin_code += char;
            }
            if ($scope.pin_code.length == 4) {
                $timeout(function(){
                    $modalInstance.close($scope.pin_code);
                });
                return;
            }


        };
    }]);
