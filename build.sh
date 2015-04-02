#!/bin/bash

DIR=$(cd $(dirname $0); pwd)

cd $DIR

#TODO check npm version
#TODO check node version

(
	echo "building sensord"
	./sensord/build.sh

	echo "building alarmd"
	./alarmd/build.sh
	
	echo "building alarmt"
	./alarmt/build.sh

) | tee build.log