#include "sensors.h"
#include <inttypes.h>
#include "logger.h"
#include "handlers.h"
#include "pins.h"
#include "i2c_master.h"


#ifdef I2C_MASTER
void Handler::processRemoteResponse (class request &req, class response &res) {

      static char resLine[2 * PROTO_BUF_SIZE + 1];
      uint8_t pos;
      char ch;
      for (pos = 0; pos < PROTO_BUF_SIZE - 1; ++pos) {
        uint8_t byte = res.u.bytes[pos];
        ch = hexchars[byte >> 4];
        resLine[2 * pos] = ch;
        ch = hexchars[byte & 0xf];
        resLine[2 * pos + 1] = ch;
      }
      resLine[2 * PROTO_BUF_SIZE - 1] = '\0';

      serialBusy = true;
      Serial.print("1,");
      Serial.println(resLine);
      Serial.flush();
      serialBusy = false;

}

bool Handler::processRemoteRequest (class request &req, class response &res) {
    Slave* slave = g_slaves.find(req.u.dst);
    if (slave == NULL) {
        ERROR(F("no such slave: ") << req.u.dst);
        return false;
    }
    if (!slave->transact(req, res)) {
        DEBUG(F("transact failed. cmd:") << req.u.cmd);
        return false;
    }
//    if (!i2cTransact(req.u.dst, req, res))
//        return false;
    processRemoteResponse(req, res);
    return true;
}
#endif

bool Handler::process(class request &req, class response &res) {
    bool b;
    if (req.u.dst != g_deviceId) {
#ifdef I2C_MASTER
        b = processRemoteRequest(req, res);
#else
        res.u.status = E_INVALID_ADDRESS;
#endif
        return b;
    } else {
        memset(res.u.bytes, 0, sizeof(res.u.bytes));
        res.u.reqid = req.u.reqid;
        res.u.src = req.u.dst;
        uint8_t result = doProcess(req, res);
        res.u.status = result;
        b = true;
    }
    return b;
}

//-------------------------------------------------------------------------------------------
class UnknownCommandHandler : public Handler {
public:
    virtual uint8_t doProcess(class request &req, class response &res) {
        ERROR(F("unknown command") << req.u.cmd);
        return 1;
    }
};

UnknownCommandHandler unknownCommandHandler = UnknownCommandHandler();

//--------------------------------------------------------------------------------
class PingHandler : public Handler {
public:
    virtual uint8_t doProcess(class request &req, class response &res) {
        memcpy(res.u.bytes, req.u.bytes, sizeof(res.u.bytes));
        return 0;
    }
};

PingHandler pingHandler = PingHandler();

//--------------------------------------------------------------------------------
class ConfigHandler : public Handler {
public:
    Pin *createPin(class request &req, uint8_t &pos, uint8_t id, uint8_t pinMode) {

        DEBUG(F("createPin id: ") << id << F(", mode:") << pinMode);

        Pin *newPin = NULL;
        switch (pinMode) {
            case INPUT:
                newPin = new(g_pins) InputPin(id);
                break;
            case OUTPUT:
                newPin = new(g_pins) OutputPin(id);
                break;
            case INPUT_PULLUP:
                newPin = new(g_pins) InputPullupPin(id);
                break;
            case OUTPUT_PULLUP:
                newPin = new(g_pins) OutputPullupPin(id);
                break;
            case INPUT_ANALOG: {
                uint8_t sensitivityDelta;
                if (!readPayload(pos, req.u.payload, sensitivityDelta))
                    return NULL;
                newPin = new(g_pins) AnalogInputPin(id, sensitivityDelta);
            }
                break;
            default:
                return NULL;
        }
        if (newPin)
            newPin->init();
        return newPin;
    }

    void clearConfig() {
        g_pins.clear();
#ifdef I2C_MASTER
        g_slaves.clear();
#endif
    }

    virtual uint8_t doProcess(class request &req, class response &res) {
        clearConfig();
        uint8_t result = _doProcess(req, res);
        if (result != 0) {
            clearConfig();
        }
        return result;
    }

    uint8_t _doProcess(class request &req, class response &res) {
        uint8_t sectionType;
        uint8_t pos = 0;

        while (readPayload(pos, req.u.payload, sectionType)) {
            bool b;
            switch (sectionType) {
                case 0: //end
                    return 0;
                case 1: //pin
                {
                    uint8_t pinNum;
                    uint8_t pinMode;
                    b = readPayload(pos, req.u.payload, pinNum) &&
                            readPayload(pos, req.u.payload, pinMode);
                    if (!b) {
                        return 1;
                    }
                    Pin *newPin = createPin(req, pos, pinNum, pinMode);
                    if (newPin == NULL)
                        return 1;
                }
                    break;
                case 2: //pinRange
                {
                    uint8_t fromPinNum;
                    uint8_t toPinNum;
                    uint8_t pinMode;
                    b = readPayload(pos, req.u.payload, fromPinNum) &&
                            readPayload(pos, req.u.payload, toPinNum) &&
                            readPayload(pos, req.u.payload, pinMode);
                    if (!b) {
                        return 1;
                    }
                    if (fromPinNum > toPinNum)
                        return 1;
                    for (uint8_t pinNum = fromPinNum; pinNum <= toPinNum; ++pinNum) {
                        Pin *newPin = createPin(req, pos, pinNum, pinMode);
                        if (newPin == NULL)
                            return 1;
                    }
                }
                    break;
#ifdef I2C_MASTER
			case 3: //I2CSlave
			{
				uint8_t slaveId;
				if (!readPayload(pos, req.u.payload, slaveId))
					return 1;

				Slave* slave = new (g_slaves) Slave(slaveId);
				if (slave == NULL) {
					ERROR(F("too many slaves"));
					return 1;
				}

				INFO(F("adding slave ") << slaveId);
			}
			break;
#endif
                default:
                    ERROR(F("invalid request format") << sectionType);
                    return 1;
            }
        }
        return 0;
    }
};

ConfigHandler configHandler = ConfigHandler();

//--------------------------------------------------------------------------------
class DumpHandler : public Handler {
public:
#ifdef I2C_MASTER
    virtual void processRemoteResponse (class request &req, class response &res) {
        Slave* slave = g_slaves.find(req.u.dst);
        if (slave != NULL)
            slave->processNewStates (req, res);
    }
#endif
    uint8_t _doProcess(class request &req, class response &res, bool force) {
        uint8_t value;
        uint8_t prevValue;
        uint8_t id;
        bool display = false;
        memset(res.u.payload, 0xff, PROTO_PAYLOAD_SIZE);
        for (uint8_t i = 0; i < g_pins.count(); ++i) {
            Pin *pin = (Pin*) g_pins.at(i);
            id = pin->id();
            value = pin->value();
            res.u.payload[id] = value;
            prevValue = pin->prevValue();
            if (prevValue == value)
                display = false;
            else {
                pin->resetPrev();
                display = true;
            }

            if (display) {
                INFO(F("STATE,") << id << "," << value);
            }
        }
        return 0;
    }

    virtual uint8_t doProcess(class request &req, class response &res) {
        return _doProcess(req, res, true);
    }
};

DumpHandler dumpHandler = DumpHandler();

//--------------------------------------------------------------------------------
//TODO remove this class
class DumpChangesHandler : public DumpHandler {
public:
    virtual uint8_t doProcess(class request &req, class response &res) {
        return _doProcess(req, res, false);
    }
};

DumpChangesHandler dumpChangesHandler = DumpChangesHandler();

//--------------------------------------------------------------------------------
class DigitalWriteHandler : public Handler {
public:
    virtual uint8_t doProcess(class request &req, class response &res) {
        uint8_t pinNum;
        uint8_t value;

        uint8_t pos = 0;
        readPayload(pos, req.u.payload, pinNum);
        readPayload(pos, req.u.payload, value);
        Pin *pin = g_pins.find(pinNum);
        if (pin == NULL) {
            ERROR(F("no such pin: ") << pinNum);
            return 1;
        }

        pin->write(value);
        INFO(F("new value: ") << value);
        return 0;
    }
};

DigitalWriteHandler digitalWriteHandler = DigitalWriteHandler();

//--------------------------------------------------------------------------------
class DigitalPulseHandler : public Handler {
public:
    virtual uint8_t doProcess(class request &req, class response &res) {

        uint8_t pinNum;
        uint8_t startValue;
        unsigned long timeout;
        uint8_t endValue;

        uint8_t pos = 0;
        readPayload(pos, req.u.payload, pinNum);
        readPayload(pos, req.u.payload, startValue);
        readPayload(pos, req.u.payload, timeout);
        readPayload(pos, req.u.payload, endValue);

        Pin *pin = g_pins.find(pinNum);
        if (pin == NULL) {
            ERROR(F("no such pin: ") << pinNum);
            return 1;
        }

        pin->pulse(startValue, timeout, endValue);
        return 0;
    }
};

DigitalPulseHandler digitalPulseHandler = DigitalPulseHandler();

//--------------------------------------------------------------------------------
class ResetHandler : public Handler {
public:
    virtual uint8_t doProcess(class request &req, class response &res) {
        void(*resetFunc)(void) = 0;
        INFO(F("resetting..."));
        resetFunc();
        return 0;
    }
};

ResetHandler resetHandler = ResetHandler();
//--------------------------------------------------------------------------------
#ifdef I2C_MASTER
class I2CScanHandler : public Handler {
public:
	virtual uint8_t doProcess (class request& req, class response& res) {
		DEBUG(F("scanning..."));
		I2c.scan();
		return 0;
	}
};
I2CScanHandler i2cScanHandler = I2CScanHandler ();
#endif

//--------------------------------------------------------------------------------
Handler *getHandler(uint8_t cmd) {
    switch (cmd) {
        case 1:
            return &pingHandler;
        case 2:
            return &configHandler;
        case 3:
            return &dumpHandler;
        case 4:
            return &digitalWriteHandler;
        case 5:
            return &digitalPulseHandler;
        case 6:
            return &resetHandler;
        case 8:
            return &dumpChangesHandler;
#ifdef I2C_MASTER
	    case 7:
		    return &i2cScanHandler;
#endif
        default:
            return  &unknownCommandHandler;
    }
}

bool processRequest(class request &req, class response &res) {
    Handler *handler = getHandler(req.u.cmd);

    bool b = handler->process(req, res);
    if (res.u.status == E_OK && !isConfigured())
        res.u.status = E_NOT_CONFIGURED;
    return b;
}
