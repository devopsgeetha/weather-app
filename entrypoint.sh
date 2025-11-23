#!/bin/bash
set -e

# Get environment variables
OPENAI_API_KEY=${OPENAI_API_KEY:-""}
GITHUB_TOKEN=${GITHUB_TOKEN:-""}
OPENAI_MODEL=${OPENAI_MODEL:-"gpt-4-turbo-preview"}

# Get GitHub event data
GITHUB_EVENT_PATH=${GITHUB_EVENT_PATH:-"/github/workflow/event.json"}
PR_NUMBER=$(jq -r '.pull_request.number' "$GITHUB_EVENT_PATH" 2>/dev/null || echo "")
REPO_FULL_NAME=$(jq -r '.repository.full_name' "$GITHUB_EVENT_PATH" 2>/dev/null || echo "")
PR_HEAD_SHA=$(jq -r '.pull_request.head.sha' "$GITHUB_EVENT_PATH" 2>/dev/null || echo "")

# Validate required inputs
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OPENAI_API_KEY is not set"
    exit 1
fi

if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ Error: GITHUB_TOKEN is not set"
    exit 1
fi

if [ -z "$PR_NUMBER" ] || [ "$PR_NUMBER" == "null" ]; then
    echo "❌ Error: Could not determine PR number from GitHub event"
    exit 1
fi

echo "🚀 Starting AI PR Review..."
echo "📝 PR Number: $PR_NUMBER"
echo "🔧 Repository: $REPO_FULL_NAME"
echo "📦 Model: $OPENAI_MODEL"

# Run the Python review script
python /app/review_pr.py \
    --openai-api-key "$OPENAI_API_KEY" \
    --github-token "$GITHUB_TOKEN" \
    --openai-model "$OPENAI_MODEL" \
    --pr-number "$PR_NUMBER" \
    --repo "$REPO_FULL_NAME" \
    --pr-sha "$PR_HEAD_SHA"

exit_code=$?
if [ $exit_code -eq 0 ]; then
    echo "✅ PR Review completed successfully"
else
    echo "❌ PR Review failed with exit code $exit_code"
fi

exit $exit_code

