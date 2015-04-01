#!/bin/bash

server="$1"
dev="$2"

if ! which socat >/dev/null 2>/dev/null
then
	PATH="$PATH:/opt/local/bin"
fi

if echo "$dev" | grep -q ":"
then
	dev=$(ssh $server readlink -f "$dev")
fi
(
	socat - EXEC:"\"ssh $server socat - $dev,nonblock,raw,echo=0\""
) | tee /tmp/a.log
