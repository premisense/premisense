#!/bin/bash

DIR=$(cd $(dirname $0); pwd)

cd $DIR

#TODO check OS type
#TODO npm update -g npm

(
	echo "building"
	./build.sh

) | tee ./install.log
