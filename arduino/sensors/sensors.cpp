#include "sensors.h"

#include <EEPROM.h>

#ifdef I2C_SLAVE
uint8_t g_deviceId = 0xff;
#else
uint8_t g_deviceId = 0;
#endif

unsigned long loopTick = 0;
bool serialBusy = 0;


//--------------------------------------------------------------------------------
#include "logger.h"
#include "heap.h"
#include "pins.h"

#include "protocol.h"
#include "handlers.h"


#ifdef I2C_MASTER
#include "i2c_master.h"
#elif defined(I2C_SLAVE)
#include "i2c_slave.h"
#endif

#include "handlers.h"


bool isConfigured () {
  if (g_pins.count() > 0)
    return true;
#ifdef I2C_MASTER
  if (g_slaves.count() != 0)
    return true;
#endif
  return false;
}



//--------------------------------------------------------------------------------
const char* hexchars = "0123456789ABCDEF";

void processLine (char* line) {
  static request req;
  static response res;

  int len = strlen(line);

  if (len < 2 * PROTO_HEDAER_SIZE) {
    ERROR(F("invalid line length. too short"));
    return;
  }

  if (len > 2 * PROTO_BUF_SIZE) {
    ERROR(F("invalid line length. too long"));
    return;
  }
  if (len % 2 != 0) {
    ERROR(F("invalid line length. must be hexbuf"));
    return;
  }

  memset(req.u.bytes, 0, sizeof(req.u.bytes));
  memset(res.u.bytes, 0, sizeof(res.u.bytes));
  uint8_t pos = 0;
  for (; *line; line += 2) {
    uint8_t b1, b2;
    if (!hex2byte(line[0], b1) || !hex2byte(line[1], b2)) {
      ERROR(F("invalid line length. must be hexbuf"));
      return;
    }

    uint8_t byte = (b1 << 4) | b2;
    req.u.bytes[pos++] = byte;
  }

  processRequest(req, res);
}

void checkInput() {
  static char line[2 * PROTO_BUF_SIZE + 2];
  static char* p = line;
  bool avail;
  char ch;

  while (true) {

    serialBusy = true;
    avail = Serial.available();
    if (avail)
      ch = Serial.read ();
    serialBusy = false;
    if (!avail)
      break;

    switch (ch) {
    case '\r':
      break;
    case '\n':
      if (p - line >= sizeof(line) - 1) {
        ERROR(F("line too long. ignored"));
        p = line;
      } else if (p == line) {  // empty?
        // we ignore empty lines. it can be used to ensure a clean line start
      } else {
        *p = '\0';
        p = line;
        processLine (line);
      }
      break;
    default:
      if (p - line < sizeof(line) - 1) {
        *p = ch;
        ++p;
      }
      break;
    }
  }
}


//--------------------------------------------------------------------------------
//--------------------------------------------------------------------------------
//--------------------------------------------------------------------------------

// the setup routine runs once when you press reset:
void setup() {
#ifdef I2C_SLAVE
  g_deviceId = EEPROM.read(0);
#endif

  clearPins();
  Serial.begin(9600);

#ifdef USE_I2C
  i2cSetup ();
#endif

}

Interval pingInterval = Interval(1000);

void loop() {
  ++loopTick;

  if (pingInterval.passed()) {
    INFO(F("PING"));

    if (!isConfigured()) {
      INFO(F("NOT_CONFIGURED"));
    }
  }

  checkInput();

  processPins();
#ifdef USE_I2C
  i2cLoop();
#endif
}

