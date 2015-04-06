#!/bin/bash
set -e
DIR=$(cd $(dirname $0); pwd)

ALARMD_DIR=$(cd $DIR/..; pwd)
cd $DIR

NODE_PATH=$(which node)

cat <<EOF > /etc/supervisor/conf.d/alarmd.conf
[program:alarmd]
command=$NODE_PATH build/alarmd.js
process_name=%(program_name)s
numprocs=1
directory=$ALARMD_DIR
autostart=true
autorestart=unexpected
startsecs=10
exitcodes=10
stdout_logfile=/alarmd.log
stdout_logfile_maxbytes=1MB
#stdout_logfile_backups=10
stderr_logfile=/alarmd.log
stderr_logfile_maxbytes=1MB
#stderr_logfile_backups
EOF
