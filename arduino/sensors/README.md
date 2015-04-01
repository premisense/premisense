## README


# Build

## build and upload an i2c_master package
TBD

## build and upload an i2c_slave package
TBD

## build and upload a standalone only package
TBD

# Arduino Nano Pin Mapping

D02-D13 = D02-D13
A00-A07 = D14-D22
A4,A5 (=D18,D19) are reserved for I2C



# I2C connection scheme
- vin (5v)
- GND
- A4 - SDA
- A5 - SCL
	
# I2C Binary Protocol BNF
## General Types
	reqid				= 	uint8_t ; id of the request
	cmd 				= 	uint8_t ; id of the command
	dst 				= 	uint8_t ; destination address (i2c slave)
	src 				= 	uint8_t ; destination address (i2c slave)
	checksum			=	uint8_t
	status 				= uint8_t
	slaveId 			= uint8_t
	pinMode 			= 0=INPUT | 1=OUTPUT | 2=INPUT_PULLUP | 3=INPUT_ANALOG | 4=OUTPUT_PULLUP
	pinNum 				= uint8_t
	value 				= uint8_t
	startValue 			= uint8_t
	endValue 			= uint8_t
	timeout 			= uint32_t
	
## Request Format
	request 			= 	reqid cmd dst req_payload checksum
	req_payload 			= (
						req_ping_payload |			; cmd=1
						req_config_payload |			; cmd=2
						req_dump_payload |			; cmd=3
						req_digital_write_payload |		; cmd=4
						req_digital_pulse_payload |		; cmd=5
						req_reset_payload |			; cmd=6
						req_i2c_scan_payload |			; cmd=7
						req_dump_changes_payload		; cmd=8
					)
					
	req_ping_payload 		= 28*uint8_t
	req_config_payload 		= *(
						req_config_digital_pin |
						req_config_digital_pin_range |
						req_config_i2c_slave
					) 0x00 ; or end of payload
	req_dump_payload 		= NONE
	req_dump_changes_payload 		= NONE
	req_digital_write_payload 	= pinNum value
	req_digital_pulse_payload 	= pinNum startValue timeout endValue
	req_reset_payload 		= NONE
	req_i2c_scan_payload		= NONE
					
	req_config_digital_pin 		= 0x01 pinNum pinConfig
	req_config_digital_pin_range 	= 0x02 fromPinNum toPinNum pinConfig
	req_config_i2c_slave 		= 0x03 slaveId

	pinConfig			= (
						0 			| 	; INPUT
						1 			| 	; OUTPUT
						2 			| 	; INPUT_PULLUP
						3 sensitivityDelta	| 	; INPUT_ANALOG
						4 				; OUTPUT_PULLUP
					)
	sensitivityDelta		= uint8_t
	
## Response Foramt
	response 			=	reqid src status res_payload checksum
	res_payload 			= (
						res_ping_payload |
						res_config_payload |
						res_dump_payload |
						res_digital_write_payload |
						res_digital_pulse_payload |
						res_reset_payload |
						res_i2c_scan_payload |
						res_dump_changes_payload
					)


	res_ping_payload 		= 28*uint8_t
	res_config_payload 		= NONE
	res_dump_payload 		= TBD
	res_dump_changes_payload 		= TBD
	res_digital_write_payload 	= NONE
	res_digital_pulse_payload 	= NONE
	res_reset_payload 		= NONE
	res_i2c_scan_payload		= NONE



# Serial Protocol
- request - hexdump(i2c_request without the checksum)
- response:
	- background messages:
		0,src,severity,text
	- commands response
		1,hexdump(i2c_response without the checksum)


# examples

## config master with 02-15 digital input pullup pins
	01020002020f0200

## config 2 slaves: 0x0c, 0x1c
	010200030c031c00

## config 3 slaves: 0x01 0x02 0x03
	01020003010302030300

## config slave 1 with 10 digital input pullup pins
	01020102020a0200

## config slave 2 D2-D03,D05-D10,D12-D17 as input pullup, D11 output pullup
	0102020202030202050a02020c1102010b0400
	
## config slave 3 with 10 digital input pullup pins
	01020302020a0200
	
## config slave 4 with 10 digital input pullup pins
	01020402020a0200
	
## dump all states from slave 1
	010301
	 
## write 01 to pin 11 of slave 2
	0104020b01
	
## tell slave 2 to write 00 to pin 11 and after 5 seconds (0x1388) to write 01
	0105020b000000138801 

## reset master
	010600
	 
## scan for slaves 
	010700
	 


01020002020f02030100
01020002020f0203010304030200
0105020b000000138801


-- 01
010200030100
0102010202030202050a02020c1102010b0400
0105010b000000138801

-- 02
010200030200
0102020202030202050a02020c1102010b0400
0105020b000000138801


ping	010102010203

010902010203








1
010200030100
01020102020a0200
ping	010101010203
010901010203

2
010200030200
01020202020a0200
ping	010102010203
010901010203
