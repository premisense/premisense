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

(
	echo "building"
	./build.sh

) | tee ./install.log
