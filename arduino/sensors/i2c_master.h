#ifndef __I2C_MASTER_H
#define __I2C_MASTER_H

#include "sensors.h"
#include "logger.h"
#include "heap.h"

#ifdef I2C_MASTER

#include "logger.h"
#include "protocol.h"

class Slave {
    uint8_t m_id;

    void resendRequest (unsigned long now, uint16_t retryTimeout);
public:
    uint8_t m_states[MAX_PINS];
    request m_pendingReq;
    uint8_t m_saveReqId;
    unsigned long m_endTime;
    unsigned long m_retryEndTime;
    uint16_t m_retryTimeout;

    Slave(uint8_t id) :
            m_id(id),
            m_endTime(0),
            m_retryEndTime(0),
            m_retryTimeout(0),
            m_saveReqId(0){
        memset(m_states, 0xff, sizeof(m_states));
        memset(&m_pendingReq, 0, sizeof(m_pendingReq));
    }

    uint8_t id() {
        return m_id;
    }

    bool isPending () {
        return m_endTime != 0;
    }

    void clearPending () {
        m_endTime = 0;
    }

    int checkPendingRequest (class response& res);
    void sendRequest (class request &req, uint16_t timeout);
    void processNewStates(class request &req, class response &res);
    bool transact(class request &req, class response &res, uint16_t timeout);
    bool transact(class request &req, class response &res) {
        return transact(req, res, I2C_TRANSACT_TIMEOUT);
    }
};

class Slaves : public Array {
public:
    Slaves()
            :
            Array (MAX_SLAVES, MAX_SLAVES*sizeof(Slave)) {
    }

    Slave *find(uint8_t id) {
        for (uint8_t i = 0; i < m_count; ++i) {
            Slave* slave = (Slave*) at(i);
            if (slave->id() == id)
                return slave;
        }
        return NULL;
    }

};

extern Slaves g_slaves;

void i2cSetup();

//bool i2cTransact(uint8_t slaveId, class request &req, class response &res, unsigned long timeout);
//
//bool i2cTransact(uint8_t slaveId, class request &req, class response &res);

//extern request i2cReq;
//extern response i2cRes;

void i2cLoop();

#endif
#endif
