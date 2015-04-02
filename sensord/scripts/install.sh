#!/bin/bash
set -e
DIR=$(cd $(dirname $0); pwd)

cd $DIR

cat <<EOF > /etc/supervisor/conf.d/sensord.conf
[program:sensord]
command=node build/sensord.js
process_name=%(program_name)s
numprocs=1
directory=$DIR
autostart=true
autorestart=unexpected
startsecs=10
exitcodes=10
environment=PATH=$(dirname $(which node)):%(ENV_PATH)s
EOF
