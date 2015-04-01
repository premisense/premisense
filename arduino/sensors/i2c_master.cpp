#include "sensors.h"
#include "handlers.h"
#include "i2c_master.h"
#include "I2C/I2C.h"
#include "i2c_slave.h"

#ifdef I2C_MASTER

request i2cReq;
response i2cRes;

static uint8_t lastReqId = 0;

void Slave::processNewStates (class request &req, class response &res) {
	if (res.u.status == E_OK) {
		for (int pin = 0; pin < MAX_PINS; ++pin) {
			if (res.u.payload[pin] != 0xff && res.u.payload[pin] != m_states[pin]) {
				m_states[pin] = res.u.payload[pin];
				_INFO(req.u.dst, F("STATE,") << pin << "," << res.u.payload[pin]);
			}
		}
	} else {
		if (res.u.status == E_NOT_CONFIGURED)
			_INFO(m_id, F("NOT_CONFIGURED"));

		_ERROR(m_id, F("transact failed. status:") << res.u.status);
	}
}


//--------------------------------------------------------------------------------
Slaves g_slaves = Slaves();

void i2cSetup () {
	pinMode(13, OUTPUT);
	I2c.begin();
	I2c.pullup(true);
	I2c.timeOut(50);
	I2c.setSpeed(false);
}

void i2cSendRequest(uint8_t slaveId, class request& req, uint16_t timeout) {
//	DEBUG("timeout: " << timeout);
	I2c.timeOut(timeout);

	// clear input buffer
	while (I2c.available() > 0)
		I2c.receive();

//	DEBUG("a" << millis());
	I2c.write(slaveId, req.u.bytes[0], &req.u.bytes[1], PROTO_BUF_SIZE - 1);
//	DEBUG("b" << millis());
}

bool i2cReadResponse(uint8_t slaveId, class request& req, class response& res, uint16_t timeout) {
	//I2c.timeOut(timeout);

	int result = I2c.read(slaveId, (uint8_t) PROTO_BUF_SIZE);
//	if (result != 0)
//		DEBUG("read result: " << result);

	uint8_t available = I2c.available();
	if (available != PROTO_BUF_SIZE) {
//			ERROR("received wrong buf size: " << available);
		return false;
	}

	for (int i = 0; i < PROTO_BUF_SIZE; ++i) {
		uint8_t x = I2c.receive();
		res.u.bytes[i] = x;
	}

	uint8_t sum = checksum(res.u.bytes, PROTO_BUF_SIZE - 1);
	if (sum != res.u.checksum) {
//		ERROR(F("wrong checksum in reply: ") << res.u.checksum << F(" expecting ") << sum);
		return false;
	}

	if (req.u.reqid != res.u.reqid) {
		ERROR(F("wrong reqid in reply: ") << res.u.reqid << F(" expecting ") << req.u.reqid);
		return false;
	}

	if (req.u.dst != res.u.src) {
		ERROR(F("wrong address in reply: ") << res.u.src << F(" expecting ") << req.u.dst);
		return false;
	}

	return true;
}

void Slave::resendRequest (unsigned long now, uint16_t retryTimeout) {
//	DEBUG("resend" << retryTimeout);
	m_retryTimeout = retryTimeout;
	m_retryEndTime = now + m_retryTimeout;
	if (m_retryEndTime == 0) // wrap around?
		m_retryEndTime = 1;
	i2cSendRequest(m_id, m_pendingReq, retryTimeout);
//	DEBUG("sent");
}

int Slave::checkPendingRequest (class response& res) {
	if (!isPending())
		return E_GENERAL_ERROR;
	unsigned long now = millis();

	if (now > m_endTime) {
		m_endTime = 0;
		return E_TIMEOUT;
	}
	if (now < m_retryTimeout)
		return E_INPROGRESS;

	if (i2cReadResponse(m_id, m_pendingReq, res, m_retryTimeout)) {
		m_endTime = 0;
		res.u.reqid = m_saveReqId;
		return E_OK;
	}

	now = millis();
	if (now > m_endTime) {
		m_endTime = 0;
		return E_TIMEOUT;
	}

	resendRequest(now, m_retryTimeout*2);


	return E_INPROGRESS;
}

void Slave::sendRequest (class request &req, uint16_t timeout) {

	m_pendingReq = req;
	m_saveReqId = m_pendingReq.u.reqid;
	if (++lastReqId > 100)
		lastReqId = 1;

	m_pendingReq.u.reqid = lastReqId;
	m_pendingReq.u.dst = m_id;
	m_pendingReq.u.checksum = checksum(m_pendingReq.u.bytes, PROTO_BUF_SIZE - 1);


	unsigned long now = millis();
	m_endTime = now + timeout;
	if (m_endTime == 0) // wrap around?
		m_endTime = 1;
	resendRequest(now, I2C_COMMAND_INITIAL_TIMEOUT);
}

bool Slave::transact(class request &req, class response &res, uint16_t timeout=I2C_TRANSACT_TIMEOUT) {
	sendRequest(req, timeout);
	do {
		delay(5); // check every 5 millis
		int result = checkPendingRequest(res);
		switch (result) {
			case E_OK:
				return true;
			case E_TIMEOUT:
				ERROR((F("transact timeout: ")) << req.u.dst);
				return false;
			case E_INPROGRESS:
				break;
			default:
				ERROR((F("transact failed: error:")) << result);
				return false;
		}
	} while (true);
}

#if 0
bool _i2cTransact(uint8_t slaveId, class request& req, class response& res, unsigned long timeout) {

	i2cSendRequest(slaveId, req, timeout);

	if (timeout > 0)
		delay(timeout);

	return i2cReadResponse(slaveId, req, res, timeout);
}

bool i2cTransact(uint8_t slaveId, class request& req, class response& res, unsigned long timeout) {
//	DEBUG("i2cTransact slaveId: " << slaveId);



	uint8_t saveReqId = req.u.reqid;
	if (++lastReqId > 100)
		lastReqId = 1;

	req.u.reqid = lastReqId;
	req.u.dst = slaveId;
	req.u.checksum = checksum(req.u.bytes, PROTO_BUF_SIZE - 1);

	bool ok =  false;
	unsigned long end = millis() + timeout;
	unsigned long commandTimeout = I2C_COMMAND_INITIAL_TIMEOUT;
	while (millis() < end) {
		if (_i2cTransact(slaveId, req, res, commandTimeout)) {
			res.u.reqid = saveReqId;
			ok = true;
			break;
		}
		commandTimeout *= 2;
	}

	req.u.reqid = saveReqId;

	if (!ok)
		return false;


//	DEBUG("i2cTransact completed.");

	if (res.u.status != 0) {

		if (res.u.status == E_NOT_CONFIGURED)
			_INFO(slaveId, "NOT_CONFIGURED");

		_ERROR(slaveId, "transact failed. status:" << res.u.status);
	}
	return true;
}

bool i2cTransact(uint8_t slaveId, class request& req, class response& res) {
	return i2cTransact (slaveId, req, res, I2C_TRANSACT_TIMEOUT);
}
#endif

void asyncDumpSlave (Slave* slave) {
//	DEBUG("here");
	const uint8_t cmd = 3;

	if (slave->isPending()) {
		int result = slave->checkPendingRequest(i2cRes);
		switch (result) {
			case E_OK:
				getHandler(cmd)->processRemoteResponse(slave->m_pendingReq, i2cRes);
				break;
			case E_TIMEOUT:
				ERROR((F("dump slave timeout: ")) << slave->id());
				break;
			case E_INPROGRESS:
				return;
			default:
				ERROR(F("Failed to dump slave: ") << slave->id() << F(". unknown error: ") << result);
				break;
		}
	}

	request req;

	// send a new request
	memset(req.u.bytes, 0, sizeof(req.u.bytes));
	req.u.cmd = cmd;
	req.u.reqid = 1;
	req.u.dst = slave->id();

	slave->sendRequest(req, I2C_TRANSACT_TIMEOUT);
//	if (!processRequest(i2cReq, i2cRes)) {
//		ERROR("Failed to dump slave: " << slave->id());
//	}

//	if (!i2cTransact(slaveId, i2cReq, i2cRes))
//		return;

}

void asyncDumpSlaves () {
	for (int i = 0; i < g_slaves.count() != 0; ++i) {
//		DEBUG("before");
		Slave* slave = (Slave*) g_slaves.at(i);
		asyncDumpSlave(slave);
//		DEBUG("after");
	}
}

Interval i2cDumpInterval = Interval(I2C_DUMP_INTERVAL);

void i2cLoop () {
	if (i2cDumpInterval.passed()) {
		asyncDumpSlaves ();
	}
}

#endif
