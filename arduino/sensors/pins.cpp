#include "sensors.h"
#include "logger.h"
#include "pins.h"

Pins g_pins;

void clearPins(){
    g_pins.clear();
}


void processPins(){
    for (uint8_t i = 0; i < g_pins.count(); ++i) {
        Pin* pin = (Pin*) g_pins.at(i);
        uint8_t oldValue = pin->value();

        pin->tick ();

        if(!pin->read ()) {
            ERROR(F("failed to read pin ") << pin->id());
        } else {
            uint8_t newValue = pin->value ();

            if (oldValue != newValue) {
                INFO(F("STATE,") << pin->id() << "," << newValue);
            }
        }
    }
}

void* operator new (unsigned int size, class Heap& heap) {
    return heap.alloc(size);
}
