#!/bin/bash

dev="$1"

if ! which socat >/dev/null 2>/dev/null
then
	PATH="$PATH:/opt/local/bin"
fi

# check again
if ! which socat >/dev/null 2>/dev/null
then
	echo "socat is not installed" >&2
	exit 1
fi

if [ -h "$dev" ]
then
	if echo "$dev" | grep -q ":"
	then
		actual_dev=$(readlink -f "$dev")
		dev="$actual_dev"
	fi
fi

if [ ! -e "$dev" ]
then
	echo "no such device" >&2
	exit 1
fi

exec socat - "$dev,nonblock,raw,echo=0"
