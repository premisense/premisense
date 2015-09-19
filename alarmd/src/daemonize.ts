///<reference path="externals.d.ts"/>
import util = require('util')
import assert = require('assert')
import _ = require('lodash')
import child_process = require('child_process')

import logging = require('./logging');
var logger = new logging.Logger(__filename);

export interface DaemonizeOptions {
  stdout ?: any;
  stderr ?: any;
  env ?: any;
  cwd ?: any;
}

export function daemonize(opt?:DaemonizeOptions):any {

  //console.log("daemonize(%s)", opt);

  opt = opt || {};

  // we are a daemon, don't daemonize again
  if (process.env.__daemon) {
    return process.pid;
  }

  var args = [].concat(process.argv);

  // shift off node
  args.shift();

  //console.log("args", args);

  // our script name
  var script = args.shift();

  var env = opt.env || process.env;

  // the child process will have this set so we can identify it as being daemonized
  env.__daemon = true;

  var stdout = opt.stdout || 'ignore';
  var stderr = opt.stderr || 'ignore';

  var cwd = opt.cwd || process.cwd;

  var cp_opt = {
    stdio: ['ignore', stdout, stderr],
    env: env,
    cwd: cwd,
    detached: true
  };

  var aprocess:any = process;
  var allArgs = [].concat(aprocess.execArgv).concat([script]).concat(args);

  //console.log("allArgs", allArgs);
  //return process.exit();

  // spawn the child using the same node process as ours
  var child = child_process.spawn(process.execPath, allArgs, cp_opt);

  var anyChild:any = child;
  // required so the parent can exit
  anyChild.unref();

  // parent is done
  return process.exit();
}
