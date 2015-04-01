'use strict';

describe('alarmt.inputBoxView module', function () {

    beforeEach(module('alarmt.inputBoxView'));

    describe('inputBoxView controller', function () {
        var scope, ctrl;

        beforeEach(inject(function($rootScope, $controller) {

            scope = $rootScope.$new();
            ctrl = $controller('InputBoxCtrl', {
                $scope: scope,
                cfg: {
                    title: 'test',
                    buttons: [

                    ]
                }
            });
        }));

        it('should ....', function() {
            expect(ctrl).toBeDefined();
        });

        it('should ....', function() {
            expect(scope.cfg.title).toBe('test');
        });

    });
});
