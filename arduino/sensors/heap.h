#ifndef __HEAP_H
#define __HEAP_H

class Heap {
	char* m_heap;
	uint16_t m_offset;
	uint16_t m_size;
public:
	Heap (uint16_t size) :
	m_offset(0),
	m_size (size) {
		m_heap = (char*) malloc(size);
	}

	virtual void* alloc(unsigned int size) {
		DEBUG("alloc : " << (int) size);

		if (m_offset + size > m_size)
			return NULL;
		void* result = &m_heap[m_offset];
		m_offset += size;
		return result;
	}

	void clear () {
		m_offset = 0;
	}

};

class Array : public Heap {
protected:
	uint8_t m_count;
	uint8_t m_maxCount;
	void** m_entries;
public:
	Array (uint16_t maxCount, uint16_t heapSize) :
			m_maxCount(maxCount),
			m_count(0),
	Heap (heapSize){
	m_entries = (void**)malloc (maxCount * sizeof(void*));
	}

	virtual void* alloc(unsigned int size) {
		if (m_count >= m_maxCount)
			return NULL;
		void* result = Heap::alloc(size);
		if (result == NULL)
			return NULL;
		m_entries[m_count] = result;
		++m_count;
		return result;
	}

	void clear () {
		m_count = 0;
		Heap::clear ();
	}

	uint8_t count () {
		return m_count;
	}

	void* at(uint8_t pos) {
		if (pos >= m_count)
			return NULL;
		return m_entries[pos];
	}


};
#endif
