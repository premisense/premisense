#!/bin/bash

DIR=$(cd $(dirname $0); pwd)
ROOT_DIR=$(cd $DIR/..; pwd)

. $ROOT_DIR/scripts/common.sh

check_gplusplus
check_node
check_npm

(
	echo "building sensord"
	$ROOT_DIR/sensord/scripts/build.sh

	echo "building alarmd"
	$ROOT_DIR/alarmd/scripts/build.sh
	
	echo "building alarmt"
	$ROOT_DIR/alarmt/scripts/build.sh
	
) | tee build.log
