#!/usr/bin/env bash

set -u

API_URL="${API_BASE_URL:-${API_URL:-http://localhost:3000}}"
API_URL="${API_URL%/}"

successful=0
failed=0

printf 'Submitting 100 jobs to %s/jobs\n' "$API_URL"

for ((job_number=1; job_number<=100; job_number++)); do
  printf 'Submitting job %d/100... ' "$job_number"

  body="{\"type\":\"sum\",\"payload\":{\"numbers\":[${job_number},$((job_number + 1000))]}}"
  http_code=$(
    curl --silent --show-error \
      --output /dev/null \
      --write-out '%{http_code}' \
      --request POST \
      --header 'Content-Type: application/json' \
      --data "$body" \
      "${API_URL}/jobs"
  )
  curl_status=$?

  if ((curl_status == 0)) && [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    ((successful += 1))
    printf 'success (HTTP %s)\n' "$http_code"
  else
    ((failed += 1))
    if ((curl_status != 0)); then
      printf 'failed (curl error)\n'
    else
      printf 'failed (HTTP %s)\n' "$http_code"
    fi
  fi
done

printf '\nSummary: %d successful, %d failed\n' "$successful" "$failed"

if ((failed > 0)); then
  exit 1
fi

exit 0
