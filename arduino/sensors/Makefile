
ifeq "${PORT}" ""
$(error missing PORT param e.g. PORT=/dev/ttyUSB1)
endif

ifeq "${I2C}" ""
$(error missing I2C param e.g. I2C=number. 0-for master mode -1-to disable i2c)
endif

ARDUINO_DIR = /usr/share/arduino
BOARD_TAG    = nano328
ARDUINO_PORT = ${PORT}
ARDUINO_LIBS = EEPROM I2C Wire Wire/utility
USER_LIBS=I2C
USER_LIB_PATH=.

ifeq "${I2C}" "-1"
	BUILD=standalone
else
	EXTRA_CPPFLAGS:=${EXTRA_CPPFLAGS} -DUSE_I2C

	ifeq "${I2C}" "0"
		BUILD=i2c_master
		EXTRA_CPPFLAGS:=${EXTRA_CPPFLAGS} -DI2C_MASTER
	else
		BUILD=i2c_slave
	endif
endif

override OBJDIR := build/${BUILD}

$(shell mkdir -p ${OBJDIR})

include /usr/share/arduino/Arduino.mk

hex_device_id=$(shell perl -e "print '0x'.substr(sprintf('%02x', ${I2C}), 0, 2);")
AVRDUDE_ARD_EXTRAOPTS:=${AVRDUDE_ARD_EXTRAOPTS} -U eeprom:w:${hex_device_id}:m

LOCAL_H_SRCS  = $(wildcard *.h)

CPPFLAGS:=${CPPFLAGS} ${EXTRA_CPPFLAGS}

dummy:=$(shell if [ "`cat $(OBJDIR)/CPPFLAGS 2>/dev/null`" != "${CPPFLAGS}" ]; then echo diff; echo "${CPPFLAGS}" > $(OBJDIR)/CPPFLAGS; fi)

$(OBJDIR)/sensors.o: sensors.cpp ${LOCAL_H_SRCS} $(OBJDIR)/CPPFLAGS
	$(CXX) -c $(CPPFLAGS) $(CXXFLAGS) sensors.cpp -o $(OBJDIR)/sensors.o

$(OBJDIR)/handlers.o: handlers.cpp ${LOCAL_H_SRCS} $(OBJDIR)/CPPFLAGS
	$(CXX) -c $(CPPFLAGS) $(CXXFLAGS) handlers.cpp -o $(OBJDIR)/handlers.o

$(OBJDIR)/pins.o: pins.cpp ${LOCAL_H_SRCS} $(OBJDIR)/CPPFLAGS
	$(CXX) -c $(CPPFLAGS) $(CXXFLAGS) pins.cpp -o $(OBJDIR)/pins.o

$(OBJDIR)/protocol.o: protocol.cpp ${LOCAL_H_SRCS} $(OBJDIR)/CPPFLAGS
	$(CXX) -c $(CPPFLAGS) $(CXXFLAGS) protocol.cpp -o $(OBJDIR)/protocol.o

$(OBJDIR)/logger.o: logger.cpp ${LOCAL_H_SRCS} $(OBJDIR)/CPPFLAGS
	$(CXX) -c $(CPPFLAGS) $(CXXFLAGS) logger.cpp -o $(OBJDIR)/logger.o

$(OBJDIR)/i2c_master.o: i2c_master.cpp ${LOCAL_H_SRCS} $(OBJDIR)/CPPFLAGS
	$(CXX) -c $(CPPFLAGS) $(CXXFLAGS) i2c_master.cpp -o $(OBJDIR)/i2c_master.o

$(OBJDIR)/i2c_slave.o: i2c_slave.cpp ${LOCAL_H_SRCS} $(OBJDIR)/CPPFLAGS
	$(CXX) -c $(CPPFLAGS) $(CXXFLAGS) i2c_slave.cpp -o $(OBJDIR)/i2c_slave.o

