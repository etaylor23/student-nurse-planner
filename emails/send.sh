#!/usr/bin/env bash
# PlaceMate transactional email sender.
#
# Renders a template (subject.txt / body.html / body.txt) with {{variable}}
# substitution and sends it via Amazon SES v2 (aws sesv2 send-email).
#
# Usage:
#   ./send.sh <template> --to <email> [--name <first name>] [--var KEY=VALUE ...] \
#             [--from "<name> <addr>"] [--dry-run]
#
# Examples:
#   # Preview only — writes rendered HTML to emails/.preview-<template>.html, sends nothing:
#   ./send.sh welcome-beta --to sarah@example.com --name Sarah --dry-run
#
#   # Actually send:
#   ./send.sh welcome-beta --to sarah@example.com --name Sarah
#
# Every {{key}} in the template files is replaced. --name sets {{first_name}}
# (defaults to "there" if omitted); --var name=value sets any other placeholder.
#
# Config via env vars (defaults in brackets):
#   PLACEMATE_AWS_PROFILE  AWS CLI profile          [personal]
#   PLACEMATE_SES_REGION   SES region               [eu-west-2]
#   PLACEMATE_FROM         From identity            [PlaceMate <hello@placemate.uk>]
#   PLACEMATE_REPLY_TO     Reply-To address         [hello@placemate.uk]
#
# NOTE: SES for this account is still in the sandbox (prod-access pending), so
# real sends only succeed to *verified* recipient addresses. Use --dry-run freely.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="$HERE/templates"

PROFILE="${PLACEMATE_AWS_PROFILE:-personal}"
REGION="${PLACEMATE_SES_REGION:-eu-west-2}"
FROM="${PLACEMATE_FROM:-PlaceMate <hello@placemate.uk>}"
REPLY_TO="${PLACEMATE_REPLY_TO:-hello@placemate.uk}"
# RFC 2369 List-Unsubscribe — a legitimacy signal inbox providers (esp. Microsoft/Gmail)
# look for. mailto form; set empty to omit. Honour opt-outs manually from hello@ for now.
LIST_UNSUB="${PLACEMATE_LIST_UNSUB:-<mailto:hello@placemate.uk?subject=unsubscribe>}"

usage() { grep '^#' "$0" | sed 's/^#\{1,\} \{0,1\}//; s/^#$//'; }

TEMPLATE="${1:-}"
if [[ -z "$TEMPLATE" || "$TEMPLATE" == -* ]]; then
  echo "error: first argument must be a template name (e.g. welcome-beta)" >&2
  echo >&2
  usage >&2
  exit 2
fi
shift

DRY_RUN=0
TO=""
FIRST_NAME=""
VAR_PAIRS=()   # each entry "key=value"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to)       TO="${2:?--to needs a value}"; shift 2 ;;
    --name)     FIRST_NAME="${2:?--name needs a value}"; shift 2 ;;
    --var)      VAR_PAIRS+=("${2:?--var needs key=value}"); shift 2 ;;
    --from)     FROM="${2:?--from needs a value}"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    *)          echo "error: unknown argument: $1" >&2; exit 2 ;;
  esac
done

TDIR="$TEMPLATES_DIR/$TEMPLATE"
[[ -d "$TDIR" ]] || { echo "error: no template directory at $TDIR" >&2; exit 2; }
for f in subject.txt body.html body.txt; do
  [[ -f "$TDIR/$f" ]] || { echo "error: template '$TEMPLATE' is missing $f" >&2; exit 2; }
done
[[ -n "$TO" ]] || { echo "error: --to is required" >&2; exit 2; }

# first_name has a friendly default; explicit --var first_name=... would win below.
[[ -n "$FIRST_NAME" ]] || FIRST_NAME="there"
VAR_PAIRS=("first_name=$FIRST_NAME" "${VAR_PAIRS[@]:-}")

render() {
  # render <file>  ->  file contents with every {{key}} replaced from VAR_PAIRS
  local content pair key val
  content="$(cat "$1")"
  for pair in "${VAR_PAIRS[@]}"; do
    [[ -z "$pair" ]] && continue
    key="${pair%%=*}"
    val="${pair#*=}"
    content="${content//"{{$key}}"/$val}"
  done
  printf '%s' "$content"
}

SUBJECT="$(render "$TDIR/subject.txt")"
SUBJECT="${SUBJECT%$'\n'}"                       # drop the trailing newline
HTML_BODY="$(render "$TDIR/body.html")"
TEXT_BODY="$(render "$TDIR/body.txt")"

# Build the SES v2 --content payload safely (jq handles all escaping).
CONTENT="$(jq -n \
  --arg subject "$SUBJECT" \
  --arg html "$HTML_BODY" \
  --arg text "$TEXT_BODY" \
  --arg listunsub "$LIST_UNSUB" \
  '{Simple:(
      {
        Subject:{Data:$subject, Charset:"UTF-8"},
        Body:{
          Html:{Data:$html, Charset:"UTF-8"},
          Text:{Data:$text, Charset:"UTF-8"}
        }
      }
      + (if $listunsub == "" then {}
         else {Headers:[{Name:"List-Unsubscribe", Value:$listunsub}]} end)
   )}')"

if [[ "$DRY_RUN" == 1 ]]; then
  PREVIEW="$HERE/.preview-$TEMPLATE.html"
  printf '%s' "$HTML_BODY" > "$PREVIEW"
  echo "DRY RUN — nothing sent."
  echo "  Template : $TEMPLATE"
  echo "  From     : $FROM"
  echo "  To       : $TO"
  echo "  Reply-To : $REPLY_TO"
  echo "  List-Unsub: ${LIST_UNSUB:-(none)}"
  echo "  Subject  : $SUBJECT"
  echo "  Region   : $REGION   (profile: $PROFILE)"
  echo "  Preview  : $PREVIEW"
  exit 0
fi

aws sesv2 send-email \
  --profile "$PROFILE" \
  --region "$REGION" \
  --from-email-address "$FROM" \
  --destination "ToAddresses=$TO" \
  --reply-to-addresses "$REPLY_TO" \
  --content "$CONTENT"

echo "Sent '$TEMPLATE' to $TO"
