#!/bin/bash

set -e
DIR=$(cd $(dirname $0); pwd)

cd $DIR

function die() {
	echo "$@" >&2
	exit 1
}

[ -f /etc/os-release ] || die "could not determine os type and version. the installation script currently supports only raspbian on RPI"

(
	. /etc/os-release
	if ! echo $NAME | grep -qi "raspbian"
	then
		die "the installation script currently supports only raspbian"
	fi
)

which socat >/dev/null 2>/dev/null || die "socat is not installed. run apt-get install socat"
which supervisord >/dev/null 2>/dev/null || die "supervisord is not installed. run apt-get install supervisor"

exit;
(
	echo "building"
	./build.sh

	(
		echo "installing sensord"
		./sensord/scripts/install.sh

		echo "installing alarmd"
		./alarmd/scripts/install.sh
		
		echo "installing alarmt"
		./alarmt/scripts/install.sh

	) | tee install.log

) | tee ./install.log

