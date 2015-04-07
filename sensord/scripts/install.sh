#!/bin/bash

DIR=$(cd $(dirname $0); pwd)
SENSORD_DIR=$(cd $DIR/..; pwd)

. $SENSORD_DIR/../scripts/common.sh


NODE_PATH=$(which node)

(
	cd $SENSORD_DIR
	npm install --unsafe-perm --production
) | tee install.log

exit

cat <<EOF > /etc/supervisor/conf.d/sensord.conf
[program:sensord]
command=$NODE_PATH build/sensord.js
process_name=%(program_name)s
numprocs=1
directory=$SENSORD_DIR
autostart=true
autorestart=unexpected
startsecs=10
exitcodes=10
stdout_logfile=/sensord.log
stdout_logfile_maxbytes=1MB
#stdout_logfile_backups=10
stderr_logfile=/sensord.log
stderr_logfile_maxbytes=1MB
#stderr_logfile_backups
EOF
