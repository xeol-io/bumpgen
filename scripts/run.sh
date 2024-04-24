#!/bin/bash

# Define total tasks
tasks=$(jq '. | length' tasks.json)

# Define concurrency level
concurrency=1

export LLM_API_KEY=$(printenv LLM_API_KEY)

# Use seq to generate a sequence of numbers, then pipe to xargs to manage concurrency
seq 0 $((tasks - 1)) | xargs -I {} -P $concurrency sh -c '
  id=$(jq -r ".[{}].id" tasks.json)
  nodeVersion=$(jq -r ".[{}].nodeVersion" tasks.json)
  mkdir -p "./output/${id}"
  . ~/.nvm/nvm.sh && nvm use $nodeVersion
  npx tsx src/eval.ts {} > "./output/${id}/output.log" 2>&1
'
