#ifndef __SENSORS_H
#define __SENSORS_H

#include <Arduino.h>
#include <inttypes.h>
#include <avr/pgmspace.h>

#define I2C_BUFFER_SIZE 32
#define PROTO_PAYLOAD_SIZE ((I2C_BUFFER_SIZE) - 4)
#define PROTO_BUF_SIZE (PROTO_PAYLOAD_SIZE + 4)
#define PROTO_HEDAER_SIZE 3

#define MAX_SLAVES 10

#ifdef USE_I2C

#ifdef I2C_MASTER
#include <I2C.h>
#else
#define I2C_SLAVE
#include <Wire.h>
#endif

#endif

#define INPUT_ANALOG 0x3
#define OUTPUT_PULLUP 0x4

const int MAX_PINS = 20;

#ifdef USE_I2C
#define I2C_COMMAND_INITIAL_TIMEOUT 50
#define I2C_TRANSACT_TIMEOUT 2000
#define I2C_DUMP_INTERVAL 10
#define I2C_SLAVE_REQUEST_TIMEOUT 2000
#endif
extern uint8_t g_deviceId;
extern unsigned long loopTick;
extern bool serialBusy;


extern const char* hexchars;

#define ENABLE_DEBUG

bool isConfigured ();

class Interval {
    uint16_t m_interval;
    unsigned long m_next;
public:
    Interval(uint16_t interval) :
        m_interval(interval) {
        m_next = millis () + interval;
    }

    bool passed () {
        unsigned long now = millis();
        if (now >= m_next) {
            m_next = now + m_interval;
            return true;
        }
        return false;
    }
};
#endif
