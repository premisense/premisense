#ifndef __HANDLERS_H
#define __HANDLERS_H


#include "protocol.h"

class Handler {
public:
    Handler() {
    }
#ifdef I2C_MASTER
    virtual void processRemoteResponse (class request &req, class response &res);
    virtual bool processRemoteRequest (class request &req, class response &res);
#endif
    bool process(class request &req, class response &res);
    virtual uint8_t doProcess(class request &req, class response &res) = 0;
};

bool processRequest(class request &req, class response &res);
Handler *getHandler(uint8_t cmd);

#endif


