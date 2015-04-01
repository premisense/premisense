#include "sensors.h"
#include "i2c_slave.h"
#include "handlers.h"
#ifdef I2C_SLAVE

request i2cReq;
response i2cRes;
bool slaveBusy = 0;
unsigned long slavePendingRequest = 0;
bool slavePendingResponse = false;


uint16_t receiveCount = 0;
bool _i2cReceive (int count) {
	++receiveCount;
	int pos = 0;
	while (Wire.available()) {
		if (pos < I2C_BUFFER_SIZE)
			i2cReq.u.bytes[pos] = Wire.read();
		++pos;
	}
	if (pos != I2C_BUFFER_SIZE) {
		return false;
	}
	if (g_deviceId != i2cReq.u.dst) {
		return false;
	}

	uint8_t tmp = checksum(&i2cReq.u.bytes[0], PROTO_BUF_SIZE - 1);
	if (i2cReq.u.checksum != tmp) {
		//TODO log E_CORRUPTED_MESSAGE;
		return false;
	}

	return true;
}

void processPendingRequest () {

//	DEBUG("processRequest cmd:" << i2cReq.u.cmd);

	memset(i2cRes.u.bytes, 0, I2C_BUFFER_SIZE);

	processRequest (i2cReq, i2cRes);

	i2cRes.u.reqid = i2cReq.u.reqid;
	i2cRes.u.src = g_deviceId;

	uint8_t tmp = checksum(&i2cRes.u.bytes[0], PROTO_BUF_SIZE - 1);
	i2cRes.u.checksum = tmp;

	slavePendingResponse = true;
	slavePendingRequest = 0;
}

uint16_t busyReceiveCount = 0;
void i2cReceive (int count) {
	if (slaveBusy || slavePendingRequest) {
		++busyReceiveCount;

		while (Wire.available()) {
			Wire.read();
		}

		return;
	}
	slaveBusy = true;
	if (_i2cReceive(count)) {
		if (i2cReq.u.reqid != i2cRes.u.reqid || !slavePendingResponse) {
			slavePendingResponse = false;
			slavePendingRequest = millis() + I2C_SLAVE_REQUEST_TIMEOUT;
		}
	}
	slaveBusy = false;
}

int busyRequestCount = 0;
int requestCount = 0;
void i2cRequest () {
	if (slaveBusy || slavePendingRequest || !slavePendingResponse) {
		++busyRequestCount;
		return;
	}
	slaveBusy = true;

	requestCount++;
	Wire.write(&i2cRes.u.bytes[0], I2C_BUFFER_SIZE);

	slaveBusy = false;
}

void i2cSetup () {
	if (g_deviceId != 0xff && g_deviceId != 0) {
		Wire.begin(g_deviceId);
		Wire.onReceive(i2cReceive);
		Wire.onRequest(i2cRequest);
	}
}

Interval i2cLogInterval = Interval(5000);

void i2cLoop () {
	if (g_deviceId == 0xff || g_deviceId == 0) {
      	INFO(F("NO_DEVICE_ID"));
		return;
	}
	unsigned long now = millis();

	if (now >= slavePendingRequest) //timeout?
		slavePendingRequest = 0; // ignore the request

	if (slavePendingRequest)
		processPendingRequest ();

	if (i2cLogInterval.passed()) {
		DEBUG(F("receive count: ") << receiveCount << F(", requestCount: ") << requestCount << F(", busyReceive:") << busyReceiveCount << F(", busyRequest:") << busyRequestCount);
	}
}


#endif
