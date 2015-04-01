#ifndef __I2C_SLAVE_H
#define __I2C_SLAVE_H

#include "sensors.h"

#ifdef I2C_SLAVE

#include "logger.h"
#include "protocol.h"

extern request i2cReq;
extern response i2cRes;
extern bool slaveBusy;

void i2cSetup ();
void i2cLoop ();



#endif
#endif
