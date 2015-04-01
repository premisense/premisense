#ifndef __PINS_H
#define __PINS_H

#include "heap.h"

class Pin {
protected:
  uint8_t m_pm;
  uint8_t m_id;
  uint8_t m_value;
  uint8_t m_prevValue;
public:
  Pin (uint8_t pm, uint8_t id)
  :
  m_pm (pm),
  m_id (id),
  m_value(0xff),
  m_prevValue(0xff) {
  }
  
  uint8_t id () {
    return m_id;
  }
  
  uint8_t mode() {
    return m_pm;
  }
  
  uint8_t value () {
    return m_value;
  }

  uint8_t prevValue () {
    return m_prevValue;
  }

  void resetPrev () {
    m_prevValue = m_value;
  }

  virtual bool init () {
    //DEBUG("Pin::init id:" << m_id << " mode:" << m_pm);
    pinMode (m_id, m_pm);
    return true;
  }
  virtual void tick () {
  }
  virtual bool read () {
    ERROR("pin: " << m_id << " does not support reading");
    return false;
  }
  virtual bool write (uint8_t value) {
    ERROR("pin: " << m_id << " does not support writing");
    return false;
  }
  virtual bool pulse (uint8_t startValue, unsigned long timeout, uint8_t stopValue) {
    ERROR("pin: " << m_id << " does not support writing");
    return false;
  }
};
void* operator new (unsigned int size, class Heap& heap);
//--------------------------------------------------------------------------------
class InputPin : public Pin {
public:
  InputPin (uint8_t id)
  :
  Pin (INPUT, id) {
  }
  
  InputPin (uint8_t pm, uint8_t id)
  :
  Pin (pm, id) {
  }
  
  virtual bool read () {
    m_value = digitalRead(m_id);
    return true;
  }
};
//--------------------------------------------------------------------------------
class InputPullupPin : public InputPin {
public:
  InputPullupPin (uint8_t id)
  :
  InputPin (INPUT_PULLUP, id) {
  } 
  // virtual bool read () {
    // DEBUG("InputPullupPin::read id:" << m_id);
    // return InputPin::read();
  // }
};
//--------------------------------------------------------------------------------
class AnalogInputPin : public Pin {
public:
  uint8_t m_sensitivityDelta;
  AnalogInputPin (uint8_t id, uint8_t sensitivityDelta)
  :
  Pin (INPUT_ANALOG, id),
  m_sensitivityDelta (sensitivityDelta) {
  }
  
  virtual bool init () {
    // no need to init an analog input
    return true;
  }
  virtual bool read () {
    uint8_t value = analogRead(m_id);
    if(m_value > value + m_sensitivityDelta || m_value < value - m_sensitivityDelta)
      m_value = value;
    return true;
  }
};
//--------------------------------------------------------------------------------
class OutputPin : public Pin {
  uint8_t m_pendingValue;
  unsigned long m_timeout;
public:
  OutputPin (uint8_t id)
  :
  Pin (OUTPUT, id),
  m_timeout(-1),
  m_pendingValue (0) {
  }
  
  OutputPin (uint8_t pm, uint8_t id)
  :
  Pin (pm, id),
  m_timeout(-1),
  m_pendingValue (0) {
  }
  
  virtual void tick () {
    if (m_timeout == (unsigned long)-1)
      return;
    if (millis() > m_timeout) {
      DEBUG("STOP_PULSE," << m_id << "," << m_pendingValue);
      m_timeout = -1;
      write (m_pendingValue);
    }
  }
  
  virtual bool read () {
    m_value = digitalRead(m_id);
    return true;
  }
  virtual bool write (uint8_t value) {
    m_timeout = -1; // cancel any pending commands;
    m_value = value;
    digitalWrite(m_id, value);
    
    DEBUG("TEST," << m_id << "," << m_value);
    return true;
  }
  virtual bool pulse (uint8_t startValue, unsigned long timeout, uint8_t stopValue) {
    DEBUG("pulse, id:" << m_id << ", value:" << startValue << ", stopValue:" << stopValue << ", timeout:" << timeout);
    if (!write (startValue))
      return false;
    m_timeout = millis() + timeout;
    m_pendingValue = stopValue;
    return false;
  }
};
//--------------------------------------------------------------------------------
class OutputPullupPin : public OutputPin {
public:
  OutputPullupPin (uint8_t id)
  :
  OutputPin (OUTPUT_PULLUP, id) {
  } 
  virtual bool init () {
    pinMode(m_id, INPUT_PULLUP);
    pinMode(m_id, OUTPUT);
    return true;
  }
};
//--------------------------------------------------------------------------------
class Pins : public Array {
public:
  Pins ()
  :
  Array (MAX_PINS, MAX_PINS*sizeof(Pin)) {
  }

  Pin* find (uint8_t id) {
    for (uint8_t i = 0; i < m_count; ++i) {
      Pin* p = (Pin*) at(i);
      if (p->id() == id)
        return p;
    }
    return NULL;
  }

};
//--------------------------------------------------------------------------------
extern Pins g_pins;

void clearPins();
void processPins();

//--------------------------------------------------------------------------------
#endif
