#include "sensors.h"
#include "logger.h"
#include "protocol.h"

uint8_t checksum(uint8_t* buffer, int size) {
    uint16_t x = 0;
    for (--size; size >= 0; --size) {
        x += buffer[size];
    }
    return x & 0xff;
}


bool readPayload(uint8_t& pos, uint8_t* payload, uint8_t& value) {
    if (pos + sizeof(uint8_t) > PROTO_PAYLOAD_SIZE)
        return false;
    value = payload[pos];
    ++pos;
    return true;
}
//-------------------------------------------------------------------------------------------
bool readPayload(uint8_t& pos, uint8_t* payload, unsigned long& value) {
    if (pos + 4 > PROTO_PAYLOAD_SIZE)
        return false;
    value = payload[pos] << 24 | payload[pos+1] << 16 | payload[pos+2] << 8 | payload[pos+3];
    pos += 4;
    return true;
}
//-------------------------------------------------------------------------------------------

bool hex2byte(char ch, uint8_t& value) {
    if (ch >= '0' && ch <= '9')
        value = ch - '0';
    else if (ch >= 'a' && ch <= 'f')
        value = 10 + ch - 'a';
    else if (ch >= 'A' && ch <= 'F')
        value = 10 + ch - 'A';
    else
        return false;
    return true;
}
