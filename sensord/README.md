# Sensord
NodeJS service that communicates with a set of gateways. Each gateway can give sensord access to multiple devices (Arduinos)  that may have multiple leafs (devices and sensors) connected to thier GPIOs.
Sensord keeps consistent state of all connected gateway, devices and thier leafs and can also send commands to each device.

