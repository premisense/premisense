#!/bin/bash

DIR=$(cd $(dirname $0); pwd)
SENSORD_DIR=$(cd $DIR/..; pwd)

. $SENSORD_DIR/../scripts/common.sh


NODE_PATH=$(which node)

(
	cd $SENSORD_DIR
	npm install --unsafe-perm --production


	if [ -f /lib/lsb/init-functions ]
		echo generating init.d script /etc/init.d/sensord
		$DIR/gen_init_d.sh
	fi

) | tee install.log


