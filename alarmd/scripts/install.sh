#!/bin/bash

DIR=$(cd $(dirname $0); pwd)
ALARMD_DIR=$(cd $DIR/..; pwd)

. $ALARMD_DIR/../scripts/common.sh


NODE_PATH=$(which node)

(
	cd $ALARMD_DIR
	npm install --unsafe-perm --production

	if [ -f /lib/lsb/init-functions ]
	then
		echo generating init.d script /etc/init.d/alarmd
		$DIR/gen_init_d.sh
	fi


) | tee install.log



