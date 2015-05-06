var mqtt = require('mqtt');
var fs = require('fs');
var util = require('util');
var _ = require('lodash');
var U = require('./u');
var gatewayModule = require('./gateway');
var logging = require('./logging');
var logger = new logging.Logger(__filename);
var configError = function (msg) {
    console.error("config error: " + msg);
    process.exit(10);
};
var Config = (function () {
    function Config() {
        this.gateways = [];
    }
    Config.prototype.doLoad = function (configJson) {
        var self = this;
        //--------------------------------------------------------------------------
        //      load mqtt settings
        //--------------------------------------------------------------------------
        logger.debug(util.format("loading mqtt settings"));
        if (!configJson['mqtt'])
            configError("missing mqtt section");
        var mqttOptions = configJson['mqtt']['options'];
        if (!mqttOptions)
            configError("missing mqtt options section");
        this.mqttClient = mqtt.connect(mqttOptions);
        //--------------------------------------------------------------------------
        //      load gateway list
        //--------------------------------------------------------------------------
        logger.debug(util.format("loading gateways"));
        this.gateways = [];
        if (!configJson['gateways'])
            configError("missing gateways section");
        _.forEach(configJson['gateways'], function (v, k) {
            logger.debug(util.format("loading gateway: %s", k));
            var gatewayType = v['type'];
            if (gatewayType === "ArduinoSerialGateway") {
                var devices = [];
                _.forEach(v['devices'], function (deviceConfig, deviceId) {
                    var deviceInitString = deviceConfig['initString'];
                    if (U.isNullOrUndefined(deviceInitString))
                        deviceInitString = "";
                    var device = new gatewayModule.ArduinoDevice(deviceId, deviceInitString);
                    devices.push(device);
                });
                var initString = v['initString'];
                if (U.isNullOrUndefined(initString))
                    configError(util.format("missing or invalid initString format. gateway %s", k));
                var serialPort = v['serialPort'];
                if (U.isNullOrUndefined(serialPort) || serialPort.toString().length === 0)
                    configError(util.format("missing or invalid serialPort. gateway %s", k));
                var remoteSSH = v['remoteSSH'];
                var gateway = new gatewayModule.ArduinoSerialGateway(self.mqttClient, "", k, devices, serialPort, initString, remoteSSH);
                self.gateways.push(gateway);
            }
            else {
                configError(util.format("unknown or missing gateway type for gateway %s", k));
            }
        });
    };
    Config.prototype.loadj = function (configJson) {
        var self = this;
        self.doLoad(configJson);
    };
    Config.prototype.loads = function (str) {
        var configJson = JSON.parse(str);
        return this.loadj(configJson);
    };
    Config.prototype.loadf = function (file) {
        return this.loads(fs.readFileSync(file, 'utf8'));
    };
    return Config;
})();
exports.Config = Config;
//# sourceMappingURL=config.js.map