#!/bin/bash

set -e
DIR=$(cd $(dirname $0); pwd)

cd $DIR

(
	npm install --unsafe-perm
	npm run build
) | tee build.log
