#!/bin/sh
set -eu

job=${1:-}
lane=${2:-}
: "${DARB_APP_INTERNAL_URL:=http://app:3000}"

# Jobs are deliberately inert until explicitly enabled after data parity/cutover.
if [ "${DARB_ENABLE_SCHEDULED_JOBS:-false}" != "true" ]; then
  exit 0
fi
if [ -z "${LOVABLE_CRON_SECRET:-}" ]; then
  echo "scheduler: missing cron secret" >&2
  exit 1
fi

case "$job" in
  daily-report)
    path=/api/public/jobs/daily-report
    ;;
  task-reminders)
    path=/api/public/jobs/task-reminders
    ;;
  whatsapp-outbox)
    [ "${DARB_ENABLE_WHATSAPP_SENDING:-false}" = "true" ] || exit 0
    path=/api/public/jobs/whatsapp-outbox
    ;;
  whatsapp-send)
    [ "${DARB_ENABLE_WHATSAPP_SENDING:-false}" = "true" ] || exit 0
    case "$lane" in a|b|c) ;; *) echo "scheduler: invalid lane" >&2; exit 2 ;; esac
    path=/api/public/jobs/whatsapp-send
    ;;
  *)
    echo "scheduler: unknown job" >&2
    exit 2
    ;;
esac

body=
if [ "$job" = "whatsapp-send" ]; then
  body="{\"lane\":\"$lane\"}"
fi

status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --max-time 20 --request POST \
  --header "Authorization: Bearer $LOVABLE_CRON_SECRET" \
  --header "Content-Type: application/json" \
  --data "$body" \
  "$DARB_APP_INTERNAL_URL$path") || {
    echo "scheduler: $job request failed at transport layer" >&2
    exit 1
  }

case "$status" in
  2*) ;;
  *) echo "scheduler: $job returned HTTP $status" >&2; exit 1 ;;
esac
