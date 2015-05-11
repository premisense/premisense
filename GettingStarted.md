# Getting Started

In this guide we will go through a common alarm system installation proceedures.

## Prerequisites:
- RPi B v2 running Ubuntu 12.04 or higher (we use Raspbian)
- One or more Arduino nano 
- 12V 3A or higher power source
- DC-DC step-down convertor for converting 12v to 5v
- Wired sensors (we are working on a wireless sensors support too)
### Optional
- 12V3A backup battery and picoUPS
- RPi compatible GSM Modem


## Hardware Setup:
TBD

## Software Setup:
- Mosquitto MQTT server
```sh
	curl -O http://repo.mosquitto.org/debian/mosquitto-repo.gpg.key
	sudo apt-key add mosquitto-repo.gpg.key
	rm mosquitto-repo.gpg.key
        sudo curl -O http://repo.mosquitto.org/debian/mosquitto-repo.list
        sudo apt-get install mosquitto mosquitto-clients python-mosquitto
```

- Node server:
```sh
	wget http://node-arm.herokuapp.com/node_latest_armhf.deb
	sudo dpkg -i node_latest_armhf.deb
	rm node_latest_armhf.deb
```
- Premisense:
```sh
	git clone https://github.com/premisense/premisense.git
	apt-get install g++
    ./install.sh
```
 ## Arduino setup
 Typical setup will have one master and number of slaves based on the amount of sensors and its wiring.
 - Instal arduino Makefile package:
```sh
	sudo apt-get install arduino-mk
```
 - Upload Arduinos' programs:
 	- Connect the master Arduino to one of the RPi USB ports.
 	- Check the which port was added by:
 		ls -ltr /dev/ttyUSB*
 	- Make and upload its program (<#> is the USB port number we found with the ls command):
 		make PORT=/dev/ttyUSB<#> I2C=0 upload
 	- Disconnect the master and do the same steps for each slave. The only difference is in the make paramaters (## is the slave ID 1,2,3...):
 		make PORT=/dev/ttyUSB<#> I2C=## upload
- Connect the master Arduino to the slaves. Each slave is connected to the master via to connections: A4 (SDA) & A5 (SCL)
- Connect all of the Arduinos to 5v source (best option is to the DC-DC step-down convertor). Ensure that all Arduinos have common ground connection
- Connect the master Arduino to one of the RPi USB ports.
- For ensuring that the RPi can communicate with all of our Arduinos, we will use a serial port terminal program:
	- Install pip and pySerial:
		wget https://bootstrap.pypa.io/get-pip.py
		python get-pip.py
		sudo pip install pySerial --upgrade
	- Open a terminal session to the master Arduino
		python -m serial.tools.miniterm -p /dev/ttyUSB0
	- The master Arduino should send an output of "not configured"
	- Configure the master (in this example, we configure it with a single slave ID 1 and the master ports 02-0f with internal pullup) by writing to the terminal session the following:
		01020002020f02030100
	This only configures the master. The slave is not configured yet we will see an output coming from the slave that it is not configured
	- Now we will send the slave initialization command for listening on ports 02-0f with internal pullup:
		01020102020f0200
	- Now we have both master and slave configured. If there is a change in one of the ports state, we will see it in the terminal. Every few seconds we will see a ping command indicating the master is alive.

## Setting up sensord:
Sensord is the Node deamon that communicates with the master and updates the Mosquitto
- Configure the /etc/sensord configuration file by copying the sample:
	cp ~/premisense/sensord/examples/sensord.conf /etc/
- Edit the file. Keep the Mosquitto configuration if you have it installed locally. Edit the "gateways" section and set it to the configuration we setup above:
   "2": {
      "type": "ArduinoSerialGateway",
      "devices": {
        "1" : {
          "initString": "01020102020f0200"
        }
      },
      "serialPort": "/dev/ttyUSB0",
      "initString": "01020002020f02030100",
      "remoteSSH": "root@as"
    }
- Save the file and start up the sensord deamon:
	/etc/init.d/sensord start
- Verify that updates get to the Mosquitto by using an MQTT client, for example:
	mosquitto_sub -h localhost -v -t /#

## Setting up alarmd:
Alarmd is the alarm system application that utilize the MQTT data to provide a smart and always connected alarm system.
- Configure the /etc/alarmd configuration file by copying the sample:
	cp ~/premisense/alarmd/examples/alarmd.conf /etc/
- Edit the file:
	- Groups:
	Groups are hierarchical. The root group is typicall "All". "Home" and "Away" are groups that correlate to the alarm state and let you specify different sensors that will cause and alarm in the two state. All the rest of the groups are customizable according to your prefernce.
	- Authentication:
	username is the key, password is for the authentication configuration and pinCode will be presented for the user in privileged requests (for example arm/disarm). There can be multiple users defined.
	- The hubs configuration maps the sensors that sensord published to the MQTT to their meaningful sensor name and group assisgnment
- Start the alarmd service:
	/etc/init.d/sensord start
- WebUI interface is available at http://<your RPi address>:8282



