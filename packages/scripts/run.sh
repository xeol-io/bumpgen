#!/bin/bash

# Define total tasks
# tasks=$(jq '. | length' tasks.json)
tasks=10

# Define concurrency level
concurrency=3

export LLM_API_KEY=$(printenv LLM_API_KEY)

# Use seq to generate a sequence of numbers, then pipe to xargs to manage concurrency
seq 0 $((tasks - 1)) | xargs -I {} -P $concurrency sh -c '
  id=$(jq -r ".[{}].id" tasks.json)
  mkdir -p "./output/${id}"
  npx tsx src/eval.ts {} > "./output/${id}/output.log" 2>&1
'
