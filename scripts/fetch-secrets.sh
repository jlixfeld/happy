#!/usr/bin/env bash
# Fetch Apple ASC secrets from Infisical.
# Sources the project .env for Infisical credentials, queries the API,
# and exports APPLE_ASC_KEY_ID and APPLE_ASC_ISSUER_ID.
#
# Usage: eval "$(./fetch-secrets.sh /path/to/project)"

set -euo pipefail

PROJECT_ROOT="${1:-.}"
ENV_FILE="$PROJECT_ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi

eval "$(grep -E '^INFISICAL_' "$ENV_FILE" | sed 's/^/export /')"

INFISICAL_HOST="${INFISICAL_HOST:-http://localhost:8888}"

TOKEN=$(curl -sf -X POST "$INFISICAL_HOST/api/v1/auth/universal-auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\": \"$INFISICAL_CLIENT_ID\", \"clientSecret\": \"$INFISICAL_CLIENT_SECRET\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: Failed to authenticate with Infisical" >&2
  exit 1
fi

SECRETS=$(curl -sf "$INFISICAL_HOST/api/v3/secrets/raw?workspaceId=$INFISICAL_PROJECT_ID&environment=dev" \
  -H "Authorization: Bearer $TOKEN")

python3 -c "
import json, sys
secrets = json.loads('''$SECRETS''').get('secrets', [])
for s in secrets:
    k = s['secretKey']
    if k.startswith('APPLE_ASC_'):
        print(f'export {k}=\"{s[\"secretValue\"]}\"')
"
