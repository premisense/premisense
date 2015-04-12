# Premisense

Premisense is an Open Source project which focus on home IoT infrastructure and applications.

## Introdution

We started the project with what we considered at the time as a simple task; replace and old fashion alarm system with a simple yet highly extensible system that takes advantage of the modern controlers and cpu such as Raspbery Pi and Arduino.

During the development of the project, we realized it is not just an alarm system we were building, but rather a basis for smart home sensing system that can utilize your existing old fashion alarm system sensors and easily add to them new sensors and functionality.

## Features and Benefits
	- Built on low cost hardware and open source software
	- Easily view and act on your sensors data
	- Rules based home Security system with mobile, tablet and web interfaces
	- Optional H/A module that uses battery backup and multiple internet connections (i.e. VDSL, mobile...) for automatic failover.
	- Easily connect your sensors to home automation controlers such as OpenHab via buitin MQTT support
	- Take advantage of existing investments in your home security system
	- Built with large (home) scale with up to hundreds of sensors with multiple Arduinos connected over I2C protocol

## High Level System Modules

Premisense is build from a few core components and extendable set of plugin components, which some of which we have already built and others we hope to build together with the community:

### Core - Sensord:
Sensord is a NodeJS service which communicate with a master Arduino based sensor, receives and update the sensors state over MQTT as well as send commands for executions by the sensors.

### Core - Arduino - Sensors:
Sensors is the arduino master slave software to collect sensor data and submit commands over a network of Arduinos. Each can control over a dozen sensors.

### App - Alarmd
A rules based alarm system that feeds of the sensors data collected by sensord and let the use switch between operations mode (Home, Away, Disabled), send notifications and execute commands (such as sound alarm)

### UI 	- Alarmt:
Web UI for the alarmd which show current and historical sensors data, display alarms, manage operation modes and bypass sensors.

### Integration with external software:
Openhab MQTT bindings allow the creation of sensor based triggered scenarios 