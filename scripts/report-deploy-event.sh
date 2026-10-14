#!/usr/bin/env bash
# Report a Hugo/K8s deploy pipeline event to CMS (durable JSONL + optional Kafka fan-out).
# Usage: report-deploy-event.sh <cluster_client_id> <phase> <status> [message]
#
# Required env:
#   DEPLOY_EVENTS_INGEST_SECRET
# Optional:
#   CMS_INGEST_URL (default https://cms.ttmenus.com/api/deploy-events/ingest)
#   DEPLOY_SOURCE_SHA, DEPLOY_SITE_REPO, DEPLOY_HOSTNAME, DEPLOY_LIVE_SHA
#   DEPLOY_EVENT_SOURCE (default hugo-rebuild)
#   GITHUB_RUN_ID, GITHUB_SERVER_URL, GITHUB_REPOSITORY
set -euo pipefail

CLIENT="${1:?cluster client id e.g. ttmenus-demo}"
PHASE="${2:?phase e.g. started|dispatch|deploy|health_check|success|failure}"
STATUS="${3:?status: running|success|failure}"
MESSAGE="${4:-}"
SOURCE="${DEPLOY_EVENT_SOURCE:-hugo-rebuild}"

CMS_URL="${CMS_INGEST_URL:-https://cms.ttmenus.com/api/deploy-events/ingest}"
SECRET="${DEPLOY_EVENTS_INGEST_SECRET:-}"

if [ -z "$SECRET" ]; then
 echo "ℹ️ DEPLOY_EVENTS_INGEST_SECRET not set: skipping deploy event ($PHASE/$STATUS)"
  exit 0
fi

RUN_ID="${GITHUB_RUN_ID:-}"
RUN_URL=""
if [ -n "$RUN_ID" ] && [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  RUN_URL="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${RUN_ID}"
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

BODY="$(jq -n \
  --arg cluster_client_id "$CLIENT" \
  --arg client_id "$CLIENT" \
  --arg source "$SOURCE" \
  --arg phase "$PHASE" \
  --arg status "$STATUS" \
  --arg message "$MESSAGE" \
  --arg commit_sha "${DEPLOY_SOURCE_SHA:-}" \
  --arg site_repo "${DEPLOY_SITE_REPO:-}" \
  --arg hostname "${DEPLOY_HOSTNAME:-}" \
  --arg live_commit "${DEPLOY_LIVE_SHA:-}" \
  --arg workflow_run_id "$RUN_ID" \
  --arg workflow_run_url "$RUN_URL" \
  --arg timestamp "$TS" \
  '{
    cluster_client_id: $cluster_client_id,
    client_id: $client_id,
    source: $source,
    phase: $phase,
    status: $status,
    message: $message,
    commit_sha: $commit_sha,
    site_repo: $site_repo,
    hostname: $hostname,
    live_commit: $live_commit,
    workflow_run_id: $workflow_run_id,
    workflow_run_url: $workflow_run_url,
    timestamp: $timestamp
  }')"

HTTP_CODE="$(curl -sS -o /tmp/deploy-event-resp.json -w '%{http_code}' \
  -X POST "$CMS_URL" \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  -d "$BODY")"

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "✅ Deploy event recorded ($PHASE/$STATUS) for $CLIENT"
else
  echo "::warning::Deploy event ingest HTTP $HTTP_CODE for $CLIENT ($PHASE/$STATUS)"
  cat /tmp/deploy-event-resp.json 2>/dev/null || true
  exit 0
fi
