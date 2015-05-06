#! /bin/bash

DIR=$(cd $(dirname $0); pwd)
SENSORD_DIR=$(cd $DIR/..; pwd)

. $SENSORD_DIR/../scripts/common.sh

NODE_PATH=$(which node)

if [ ! -f /lib/lsb/init-functions ]
then
	die "This system is not a Linux Standard Base."
fi

cat - > /etc/init.d/sensord <<EOF_INIT_D
#! /bin/bash

### BEGIN INIT INFO
# Provides:		sensord
# Required-Start:	\$remote_fs \$syslog
# Required-Stop:	\$remote_fs \$syslog
# Default-Start:	2 3 4 5
# Default-Stop:		0 1 6
# Short-Description:	bridge between a serial interface and MQTT
# Description: 
#  This is a daemon that bridges between a serial interface connected to multiple arduinos and MQTT
#  
### END INIT INFO

set -e

declare -a DAEMON_OPTS

DAEMON_OPTS+=("-d")
DAEMON_OPTS+=("-l" "syslog:{\"protocol\":\"unix\",\"path\":\"/dev/log\"}")
DAEMON_OPTS+=("-l" "DailyRotateFile:{\"filename\":\"/var/log/sensord.log\"}")
CONF=/etc/sensord.conf
SENSORD_DIR="$SENSORD_DIR"
PIDFILE=/var/run/sensord.pid
DAEMON="$NODE_PATH"

[ -f /etc/default/sensord ] && . /etc/default/sensord

DAEMON_OPTS+=("-c" "\$CONF")
DAEMON_OPTS+=("-p" "\${PIDFILE}")

# /etc/init.d/sensord: start and stop the sensord daemon

test -x \${DAEMON} || exit 0
test -f \${CONF} || exit 0

umask 022

. /lib/lsb/init-functions

# Are we running from init?
run_by_init() {
    ([ "\$previous" ] && [ "\$runlevel" ]) || [ "\$runlevel" = S ]
}

export PATH="\${PATH:+\$PATH:}/usr/sbin:/sbin"

case "\$1" in
  start)
	if init_is_upstart; then
	    exit 1
	fi
	log_daemon_msg "Starting daemon:" "sensord"
	if start-stop-daemon --start --quiet --chdir \$SENSORD_DIR --oknodo --pidfile \${PIDFILE} --exec \${DAEMON} -- build/sensord.js -b \${DAEMON_OPTS[@]} ; then
	    log_end_msg 0
	else
	    log_end_msg 1
	fi
	;;
  stop)
	if init_is_upstart; then
	    exit 0
	fi
	log_daemon_msg "Stopping daemon:" "sensord"
	if start-stop-daemon --stop --quiet --oknodo --pidfile \${PIDFILE}; then
	    log_end_msg 0
	    rm -f \${PIDFILE}
	else
	    log_end_msg 1
	fi
	;;

  reload|force-reload|restart)
	if init_is_upstart; then
	    exit 1
	fi
	log_daemon_msg "Restarting daemon:" "sensord"
	if start-stop-daemon --stop --quiet --oknodo --retry 30 --pidfile \${PIDFILE}; then
	    rm -f \${PIDFILE}
	fi
	if start-stop-daemon --start --quiet --chdir \$SENSORD_DIR --oknodo --pidfile \${PIDFILE} --exec \${DAEMON} -- build/sensord.js -b \${DAEMON_OPTS[@]} ; then
	    log_end_msg 0
	else
	    log_end_msg 1
	fi
	;;

  try-restart)
	if init_is_upstart; then
	    exit 1
	fi
	log_daemon_msg "Restarting daemon" "sensord"
	set +e
	start-stop-daemon --stop --quiet --retry 30 --pidfile \${PIDFILE}
	RET="\$?"
	set -e
	case \$RET in
	    0)
		# old daemon stopped
		rm -f \${PIDFILE}
		if start-stop-daemon --start --quiet --chdir \$SENSORD_DIR --oknodo --pidfile \${PIDFILE} --exec \${DAEMON} -- build/sensord.js -b \${DAEMON_OPTS[@]} ; then
		    log_end_msg 0
		else
		    log_end_msg 1
		fi
		;;
	    1)
		# daemon not running
		log_progress_msg "(not running)"
		log_end_msg 0
		;;
	    *)
		# failed to stop
		log_progress_msg "(failed to stop)"
		log_end_msg 1
		;;
	esac
	;;

  status)
	if init_is_upstart; then
	    exit 1
	fi
	status_of_proc -p \${PIDFILE} \${DAEMON} sensord && exit 0 || exit \$?
	;;

  *)
	log_action_msg "Usage: /etc/init.d/sensord {start|stop|reload|force-reload|restart|try-restart|status}"
	exit 1
esac

exit 0
EOF_INIT_D

chmod +x /etc/init.d/sensord
update-rc.d sensord defaults

