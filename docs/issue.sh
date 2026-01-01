#!/usr/bin/env bash

REPO="pennowtech/rusty-can-studio"

tail -n +2 Tasks.csv | while IFS='|' read -r title body labels milestone; do
  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --body "$body" \
    --label "$labels" \
    --milestone "$milestone"
done
