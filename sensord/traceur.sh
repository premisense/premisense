#!/bin/bash

set -e
traceur --source-root "../.." --type-assertions --atscript --modules commonjs --require true --source-maps file --dir ./src out/src