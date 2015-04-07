#!/bin/bash

# strict mode
set -e

DIR=$(cd $(dirname $0); pwd)

cd $DIR

function die() {
	echo "$@" >&2
	exit 1
}

function normalize_version() {
	perl -e '$v = $ARGV[0]; $v =~ s/^[^0-9]*//g; @a = split (/\./, $v); printf ("%03d.%04d.%04d\n", $a[0], $a[1], $a[2]);' "$1"
}

function vercmp() {
	v1=$(normalize_version "$1")
	op="$2"
	v2=$(normalize_version "$3")
	if ! perl -e "exit 1 unless ('$v1' $op '$v2');"
	then
		return 1
	fi
	return 0
}

function check_gplusplus() {
	which g++ 2>/dev/null >/dev/null || die "could not find g++ or it is not installed. run: 'apt-get install g++'"
}

function check_node() {
	which node 2>/dev/null >/dev/null || die "could not find node or it is not installed. follow TBD:URL on how to upgrade/install"
	if ! vercmp "$(node -v)" ge "0.11.12"
	then
		die "expecting node v0.11.12 or higher. follow TBD:URL on how to upgrade/install"
	fi
}

function check_npm() {
	which npm 2>/dev/null >/dev/null || die "could not find npm or it is not installed. to upgrade to the latest, run: 'npm update -g npm'"
	if ! vercmp "$(npm -v)" ge "2.6.0"
	then
		die "expecting npm 2.6.0 or higher. to upgrade to the latest, run: 'npm update -g npm'"
	fi
}

function check_socat() {
	which socat >/dev/null 2>/dev/null || die "socat is not installed. run apt-get install socat"
}

