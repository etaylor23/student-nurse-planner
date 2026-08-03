#!/usr/bin/env bash
# PlaceMate transactional email sender.
#
# Composes a template into the shared brand shell, substitutes {{variables}}, and
# sends it via Amazon SES v2 (aws sesv2 send-email).
#
# Each email is content only — the card, logo lockup and footer live once in
# templates/_shell and are wrapped around it at send time, so there are no generated
# files to rebuild and a change to the chrome lands in every email at once:
#
#   templates/_shell/body.html   the HTML chrome; slots {{title}} {{preheader}}
#   templates/_shell/body.txt    the text chrome;  slot  {{content}} {{footer_reason}}
#   templates/<name>/subject.txt subject line (one line)
#   templates/<name>/content.html the HTML body copy — no <html>, no card, no footer
#   templates/<name>/content.txt  the plain-text body copy (hand-written, not derived)
#   templates/<name>/vars         key=value lines filling the shell's slots
#
# Usage:
#   ./send.sh <template> --to <email> [--name <first name>] [--bcc <email[,email]>] \
#             [--var KEY=VALUE ...] [--from "<name> <addr>"] [--dry-run]
#
# Examples:
#   # Preview only — writes rendered HTML to templates/<name>/preview.html, sends nothing:
#   ./send.sh welcome-beta --to sarah@example.com --name Sarah --dry-run
#
#   # Actually send:
#   ./send.sh welcome-beta --to sarah@example.com --name Sarah
#
# Every {{key}} is replaced from, in precedence order: --name (sets {{first_name}},
# defaults to "there"), then --var KEY=VALUE, then the template's `vars` file. Any
# placeholder left unfilled is a hard error — template syntax must never reach an inbox.
#
# Config via env vars (defaults in brackets):
#   PLACEMATE_AWS_PROFILE  AWS CLI profile          [personal]
#   PLACEMATE_SES_REGION   SES region               [eu-west-2]
#   PLACEMATE_FROM         From identity            [PlaceMate <hello@placemate.uk>]
#   PLACEMATE_REPLY_TO     Reply-To address         [hello@placemate.uk]
#
# NOTE: SES production access is live (2026-07-18) — mail reaches any recipient, no
# per-address verification needed. Use --dry-run freely for content review.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="$HERE/templates"
SHELL_DIR="$TEMPLATES_DIR/_shell"

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
BCC=""
FIRST_NAME=""
VAR_PAIRS=()   # each entry "key=value"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to)       TO="${2:?--to needs a value}"; shift 2 ;;
    --bcc)      BCC="${2:?--bcc needs a value}"; shift 2 ;;
    --name)     FIRST_NAME="${2:?--name needs a value}"; shift 2 ;;
    --var)      VAR_PAIRS+=("${2:?--var needs key=value}"); shift 2 ;;
    --from)     FROM="${2:?--from needs a value}"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    *)          echo "error: unknown argument: $1" >&2; exit 2 ;;
  esac
done

# _shell holds the shared chrome, not a sendable email — the underscore marks it as such.
[[ "$TEMPLATE" == _* ]] && { echo "error: '$TEMPLATE' is a shared part, not a template" >&2; exit 2; }

TDIR="$TEMPLATES_DIR/$TEMPLATE"
[[ -d "$TDIR" ]] || { echo "error: no template directory at $TDIR" >&2; exit 2; }
for f in subject.txt content.html content.txt vars; do
  [[ -f "$TDIR/$f" ]] || { echo "error: template '$TEMPLATE' is missing $f" >&2; exit 2; }
done
for f in body.html body.txt; do
  [[ -f "$SHELL_DIR/$f" ]] || { echo "error: the shared shell is missing $f" >&2; exit 2; }
done
[[ -n "$TO" ]] || { echo "error: --to is required" >&2; exit 2; }

# Precedence is render order — the loop below replaces on first match, so whatever is
# listed earliest wins. --name first, then --var, then the template's own vars file.
[[ -n "$FIRST_NAME" ]] || FIRST_NAME="there"
VAR_PAIRS=("first_name=$FIRST_NAME" "${VAR_PAIRS[@]:-}")

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "${line//[[:space:]]/}" || "$line" == \#* ]] && continue
  [[ "$line" == *=* ]] || { echo "error: $TDIR/vars: not a key=value line: $line" >&2; exit 2; }
  VAR_PAIRS+=("$line")
done < "$TDIR/vars"

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

compose() {
  # compose <shell file> <already-rendered content>  ->  content wrapped in the shell.
  # {{content}} is substituted LAST and never re-scanned, so body copy containing
  # something that looks like a placeholder can't be mangled by the renderer.
  local shell
  shell="$(render "$1")"
  printf '%s' "${shell//"{{content}}"/$2}"
}

SUBJECT="$(render "$TDIR/subject.txt")"
SUBJECT="${SUBJECT%$'\n'}"                       # drop the trailing newline
HTML_BODY="$(compose "$SHELL_DIR/body.html" "$(render "$TDIR/content.html")")"
TEXT_BODY="$(compose "$SHELL_DIR/body.txt" "$(render "$TDIR/content.txt")")"

# A surviving {{placeholder}} means a var the template needs was never supplied. Fail
# loudly: shipping literal template syntax to a real recipient is worse than not sending.
for part in "$SUBJECT" "$HTML_BODY" "$TEXT_BODY"; do
  if [[ "$part" == *'{{'* ]]; then
    echo "error: unfilled placeholder(s) — add them to $TDIR/vars or pass --var:" >&2
    printf '%s\n' "$part" | grep -o '{{[a-z_]\{1,\}}}' | sort -u >&2
    exit 2
  fi
done

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

# Destination: To + optional Bcc (comma-separated). Built as JSON to avoid the CLI
# shorthand's list/struct ambiguity when both To and Bcc are present.
DEST="$(jq -n --arg to "$TO" --arg bcc "$BCC" \
  '{ToAddresses:[$to]} + (if $bcc == "" then {} else {BccAddresses:($bcc | split(","))} end)')"

if [[ "$DRY_RUN" == 1 ]]; then
  # Lives beside the template it renders, not loose in emails/. Generated on every dry
  # run and gitignored — it's a viewer, never a source of truth.
  PREVIEW="$TDIR/preview.html"
  printf '%s' "$HTML_BODY" > "$PREVIEW"
  echo "DRY RUN — nothing sent."
  echo "  Template : $TEMPLATE"
  echo "  From     : $FROM"
  echo "  To       : $TO"
  echo "  Bcc      : ${BCC:-(none)}"
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
  --destination "$DEST" \
  --reply-to-addresses "$REPLY_TO" \
  --content "$CONTENT"

echo "Sent '$TEMPLATE' to $TO"
