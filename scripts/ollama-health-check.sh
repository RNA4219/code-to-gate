#!/bin/bash
#
# Ollama Health Check Script
# Verifies Ollama server is running and accessible on localhost
#

set -e

# Default configuration
OLLAMA_HOST="127.0.0.1"
OLLAMA_PORT="11434"
OLLAMA_URL="http://${OLLAMA_HOST}:${OLLAMA_PORT}"
TIMEOUT=5
RETRIES=3
RETRY_DELAY=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --host)
      OLLAMA_HOST="$2"
      shift 2
      ;;
    --port)
      OLLAMA_PORT="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --retries)
      RETRIES="$2"
      shift 2
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    --help)
      echo "Ollama Health Check Script"
      echo ""
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --host <host>       Ollama host (default: 127.0.0.1)"
      echo "  --port <port>       Ollama port (default: 11434)"
      echo "  --timeout <seconds> Request timeout (default: 5)"
      echo "  --retries <count>   Number of retries (default: 3)"
      echo "  --json              Output in JSON format"
      echo "  --help              Show this help message"
      echo ""
      echo "Note: Only localhost addresses are allowed for security."
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate localhost-only access
validate_localhost() {
  local host="$1"

  # Allowed localhost addresses
  local allowed=("127.0.0.1" "localhost" "::1" "0.0.0.0")

  for allowed_host in "${allowed[@]}"; do
    if [[ "$host" == "$allowed_host" ]]; then
      return 0
    fi
  done

  return 1
}

# Check if address is localhost
if ! validate_localhost "$OLLAMA_HOST"; then
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo '{"healthy":false,"error":"Non-localhost address not allowed","host":"'$OLLAMA_HOST'"}'
  else
    echo -e "${RED}Error: Non-localhost address not allowed for security${NC}"
    echo "Allowed hosts: 127.0.0.1, localhost, ::1, 0.0.0.0"
  fi
  exit 1
fi

OLLAMA_URL="http://${OLLAMA_HOST}:${OLLAMA_PORT}"

# Health check function
check_health() {
  local attempt=1
  local response_time=0

  while [[ $attempt -le $RETRIES ]]; do
    if [[ "$JSON_OUTPUT" != "true" ]]; then
      echo -e "${YELLOW}Checking Ollama health (attempt $attempt/$RETRIES)...${NC}"
    fi

    # Record start time
    start_time=$(date +%s%N)

    # Make HTTP request
    response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$TIMEOUT" "${OLLAMA_URL}/api/tags" 2>&1) || response="000"

    # Calculate response time
    end_time=$(date +%s%N)
    response_time=$(( (end_time - start_time) / 1000000 ))

    if [[ "$response" == "200" ]]; then
      # Get available models
      models=$(curl -s --connect-timeout "$TIMEOUT" "${OLLAMA_URL}/api/tags" 2>/dev/null | jq -r '.models[].name' 2>/dev/null || echo "")

      if [[ "$JSON_OUTPUT" == "true" ]]; then
        timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        echo '{"healthy":true,"provider":"ollama","baseUrl":"'$OLLAMA_URL'","responseTimeMs":'$response_time',"models":['$(echo "$models" | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//' | head -c -1)'],"timestamp":"'$timestamp'"}'
      else
        echo -e "${GREEN}Ollama is healthy!${NC}"
        echo "  URL: $OLLAMA_URL"
        echo "  Response time: ${response_time}ms"
        if [[ -n "$models" ]]; then
          echo "  Available models:"
          echo "$models" | while read -r model; do
            echo "    - $model"
          done
        fi
      fi
      return 0
    fi

    if [[ "$JSON_OUTPUT" != "true" ]]; then
      echo -e "${RED}Attempt $attempt failed: HTTP $response${NC}"
    fi

    if [[ $attempt -lt $RETRIES ]]; then
      sleep "$RETRY_DELAY"
    fi

    ((attempt++))
  done

  # All retries failed
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo '{"healthy":false,"provider":"ollama","baseUrl":"'$OLLAMA_URL'","error":"Connection failed after '$RETRIES' retries","responseTimeMs":'$response_time',"timestamp":"'$timestamp'"}'
  else
    echo -e "${RED}Ollama health check failed after $RETRIES retries${NC}"
    echo "  URL: $OLLAMA_URL"
    echo "  Last response: HTTP $response"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check if Ollama is running: ollama serve"
    echo "  2. Check if port $OLLAMA_PORT is open"
    echo "  3. Check firewall settings"
  fi

  return 1
}

# Run health check
check_health
exit_code=$?

# Exit with appropriate code
exit $exit_code