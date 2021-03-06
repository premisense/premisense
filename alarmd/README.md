# Alarmd

A rule based alarm system service that is built on the sensord distributed sensors framework.
Alarmd is written in typescript and the MQTT protocol and is running on top of NodeJS.

### Alarmd main functions:

	- Capture and archive sensors state changes
	- Manage alarm system state (Home, Away, Disabled) & sensors meta data (i.e. active/disabled sensor)
	- Role based alarm system user management 
	- Trigger actions, such as sound alarm & send a notification from the sensors state changes and the system state
	- Expose a Restful interface


### Restful interface

	User authntication is done using HTTP basic authentication. All requests has to be authenticated
	(i.e. GET http://user:password@hostname/login)

	- GET  /login
	Verify user login. 
		Status 200 if sucessfull

	- GET  /events
		Query string inputs:
			- maxSize: the maximum number of events to return
			- since: Previous syncpoint value if exists. (The final event in the output contains the syncpoint you can use for the next 'since' value to get only updates)
		
		Outputs: 
			Json array of events. Each event has an ID, a name , a syncpoint timestamp and a dynamic set of key value attributes for the item.

	- POST /armed_state
		x-pincode header if pincode is required
		Input body is the ArmedState key (ArmedState is a map defined in the config file)
		Outputs:
		HTTP 400 if the ArmedState key is not found
		HTTP 403 if pincode is required and was not supplied
		HTTP 200 if successfull

	- POST /bypass_sensor
		x-pincode header 
		Input body is the sensor id of an active sensor device. Devices are defined in under the hubs=>hub_id=>devices=>device_id in the config file
		Outputs:
		HTTP 403 if pincode was not supplied
		HTTP 400 if device_id was not found
		HTTP 200 if success

	- POST /cancel_armeing
		x-pincode header 
		Outputs:
		HTTP 403 if pincode was not supplied
		HTTP 400 if it cannot go back to the previous armedState (either it is not defined, or the new state is already active)
		HTTP 200 if success		

	- GET  /sensor_history.json
		Query string inputs:
			- item: The itemId of the sensor device

		Outputs:
		HTTP 400 if itemId was not supplied or cannot be found
		HTTP 200 if success		


	- GET  /event_log

## Project Setup

This project uses [gulp](http://gulpjs.com/) as its build system. 

- Install gulp: `$ npm install -g gulp`

1. Install dependencies: `$ npm install`
2. Build and run: `$ gulp buildrun`


## Testing

This project usings [mocha](http://visionmedia.github.io/mocha/) for unit testing. Install mocha:

- `$ npm install -g mocha`

To compile and test run:

-  `$ gulp && mocha`

## Troubleshooting & Useful Tools

_Examples of common tasks_

> e.g.
> 
> - How to make curl requests while authenticated via oauth.
> - How to monitor background jobs.
> - How to run the app through a proxy.

## License

MIT