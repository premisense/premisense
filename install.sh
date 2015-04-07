#!/bin/bash

DIR=$(cd $(dirname $0); pwd)
. $DIR/scripts/common.sh


[ -f /etc/os-release ] || die "could not determine os type and version. the installation script currently supports only raspbian on RPI"

(
	. /etc/os-release
	if ! echo $NAME | grep -qi "raspbian"
	then
		die "the installation script currently supports only raspbian"
	fi
)

check_gplusplus
check_node
check_npm
check_socat

#which supervisord >/dev/null 2>/dev/null || die "supervisord is not installed. run apt-get install supervisor"

(
	echo "installing sensord"
	./sensord/scripts/install.sh

	echo "installing alarmd"
	./alarmd/scripts/install.sh
	
) | tee install.log


