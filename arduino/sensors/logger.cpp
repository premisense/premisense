#include "sensors.h"
#include "logger.h"

_endl g_endl = _endl();
_beginl g_beginl = _beginl();

Logger serialLogger = Logger(false);
Logger nullLogger = Logger(true);

void Logger::write(const char *s) {
    if (m_null)
        return;
    Serial.print(s);
//    uint8_t b;
//    do {
//        b = pgm_read_byte_near(s);
//        ++s;
//        Serial.print((char) b);
//    } while (b != 0);

//    Serial.print(s);
}

