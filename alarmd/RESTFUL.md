	#HTTP/RESTful API

	User authntication is done using HTTP basic authentication. All requests has to be authenticated
	(i.e. GET http://user:password@hostname/login)

	- GET  /login
	Verify user login. 
		Status 200 if sucessfull

	- GET  /events
		Events is used to get an array of new events since the previous query that was made (the since syncpoint)
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
		Returns hstorical sensors data aggregated into 5 minute buckets

		Query string inputs:
			- item: The itemId of the sensor device

		Outputs:
		HTTP 400 if itemId was not supplied or cannot be found
		HTTP 200 if success		


	- GET  /event_log
		Outputs:
		Json array of the alarm events (change in aram state, sensors events that would cause and alarm and alarms)

		HTTP 500 in case of error
		HTTP 200 if Success

