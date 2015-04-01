#ifndef __PROTOCOL_H
#define __PROTOCOL_H

#define E_OK 0
#define E_INVALID_REQUEST 1
#define E_CORRUPTED_MESSAGE 2
#define E_NOT_CONFIGURED 3
#define E_SLAVE_BUSY 4
#define E_INVALID_ADDRESS 5
#define E_TIMEOUT 6
#define E_GENERAL_ERROR 7
#define E_INPROGRESS 8


extern uint8_t checksum(uint8_t* buffer, int size);


struct request {
	union{
		struct {
			uint8_t reqid;
			uint8_t	cmd;
			uint8_t dst;
			uint8_t payload[PROTO_PAYLOAD_SIZE];
			uint8_t checksum;
		};
		uint8_t bytes[PROTO_BUF_SIZE];
	} u;
} __attribute__((packed));

struct response {
	union{
		struct {
			uint8_t reqid;
			uint8_t src;
			uint8_t status;
			uint8_t payload[PROTO_PAYLOAD_SIZE];
			uint8_t checksum;
		};
		uint8_t bytes[PROTO_BUF_SIZE];
	} u;
} __attribute__((packed));

//-------------------------------------------------------------------------------------------
bool readPayload(uint8_t& pos, uint8_t* payload, uint8_t& value);
bool readPayload(uint8_t& pos, uint8_t* payload, unsigned long& value);
bool hex2byte(char ch, uint8_t& value);

//--------------------------------------------------------------------------------
//--------------------------------------------------------------------------------

#endif