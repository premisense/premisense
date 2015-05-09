#!/bin/bash

nl=$'\n'
(

	set -e
	traceur --source-root "../.." --types true --type-assertions --atscript --modules commonjs --require true --source-maps file --dir ./src out/src
) #2>&1 | sed -e "s/,/\\$nl/g" >&2
