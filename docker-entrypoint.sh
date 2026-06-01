#!/bin/sh
set -e

: "${PORT:=8080}"
: "${API_PORT:=3001}"

sed \
  -e "s|\${PORT}|${PORT}|g" \
  -e "s|\${API_PORT}|${API_PORT}|g" \
  /etc/nginx/templates/default.conf.template > /etc/nginx/http.d/default.conf

node server/index.js &
nginx -g "daemon off;"
