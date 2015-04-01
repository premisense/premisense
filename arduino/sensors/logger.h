#ifndef __LOGGER_H
#define __LOGGER_H

#ifdef ENABLE_DEBUG
#define _DEBUG(srcId, x) serialLogger << g_beginl << srcId << ',' << F("DEBUG") << ',' << x << g_endl;
#else
#define _DEBUG(srcId,x) 
#endif

#define _INFO(srcId, x) serialLogger << g_beginl << srcId << ',' << F("INFO") << ',' << x << g_endl;
#define _ERROR(srcId, x) serialLogger << g_beginl << srcId << ',' << F("ERROR") << ',' << x << g_endl;

#define DEBUG(x) _DEBUG(g_deviceId,x)
#define INFO(x) _INFO(g_deviceId,x)
#define ERROR(x) _ERROR(g_deviceId,x)

class _endl {
};

extern _endl g_endl;

class _beginl {
};

extern _beginl g_beginl;

//--------------------------------------------------------------------------------
class Logger {
    bool m_null;
public:
    Logger(bool null) :
            m_null(null) {
    }

    bool busy() {
        return serialBusy;
    }

    void writePrefix() {
        serialBusy = true;
        Serial.print('0');
        Serial.print(',');
    }

    void write(long n) {
        if (m_null)
            return;
        Serial.print(n);
    }

    void write(unsigned long n) {
        if (m_null)
            return;
        Serial.print(n);
    }

    void write(char c) {
        if (m_null)
            return;
        Serial.print(c);
    }

    void write(const __FlashStringHelper*s) {
        if (m_null)
            return;
        Serial.print(s);
    }
    void write(const char *s);

    void writeEnd() {
        if (m_null)
            return;
        Serial.print('\n');
        Serial.flush();
        serialBusy = false;
    }
};

//--------------------------------------------------------------------------------
extern Logger serialLogger;
extern Logger nullLogger;


//--------------------------------------------------------------------------------
inline Logger &operator<<(class Logger &s, const _beginl &x) {
    if (s.busy())
        return nullLogger;
    s.writePrefix();
    return s;
}

//--------------------------------------------------------------------------------
inline Logger &operator<<(class Logger &s, int n) {
    s.write((long) n);
    return s;
}

//--------------------------------------------------------------------------------
inline Logger &operator<<(class Logger &s, uint8_t n) {
    s.write((unsigned long) n);
    return s;
}

//--------------------------------------------------------------------------------
inline Logger &operator<<(class Logger &s, uint16_t n) {
    s.write((unsigned long) n);
    return s;
}

//--------------------------------------------------------------------------------
inline Logger &operator<<(class Logger &s, const char *c) {
    s.write(c);
    return s;
}

//--------------------------------------------------------------------------------
inline Logger &operator<<(class Logger &s, const __FlashStringHelper*fs) {
    s.write(fs);
    return s;
}

//--------------------------------------------------------------------------------
inline Logger &operator<<(class Logger &s, char c) {
    s.write(c);
    return s;
}

//--------------------------------------------------------------------------------
inline Logger &operator<<(class Logger &s, long n) {
    s.write(n);
    return s;
}

//--------------------------------------------------------------------------------
inline Logger &operator<<(class Logger &s, unsigned long n) {
    s.write(n);
    return s;
}

//--------------------------------------------------------------------------------
inline Logger &operator<<(class Logger &s, const _endl &x) {
    s.writeEnd();
    return s;
}


#endif
