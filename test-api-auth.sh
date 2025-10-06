#!/bin/bash

# Test script for API authentication
# Usage: ./test-api-auth.sh YOUR_API_KEY

API_KEY="${1:-osk_3d89a6bdeee137923d1559bd1aaca9c516e2ae40dd96f06355acbe28accdea4a}"
BASE_URL="http://localhost:3000"

echo "🔐 Testing API Authentication with Key: ${API_KEY:0:20}..."
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3

    echo -n "Testing $method $endpoint ... "

    response=$(curl -s -w "\n%{http_code}" \
        -X "$method" \
        -H "Authorization: Bearer $API_KEY" \
        "$BASE_URL$endpoint")

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo -e "${GREEN}✅ $http_code${NC}"
    elif [ "$http_code" = "401" ]; then
        echo -e "${RED}❌ $http_code - Unauthorized${NC}"
        echo "   Response: $body"
    else
        echo -e "${YELLOW}⚠️  $http_code${NC}"
        echo "   Response: ${body:0:100}..."
    fi
}

echo "📋 Testing OpenAPI Documented Endpoints:"
echo "=========================================="
echo ""

# Test all documented endpoints
test_endpoint "GET" "/api/status" "Health check (public)"
test_endpoint "GET" "/api/contracts" "List contracts"
test_endpoint "GET" "/api/contracts?full=true" "List contracts (full)"
test_endpoint "GET" "/api/signatures" "List signatures"
test_endpoint "GET" "/api/signatures?full=true" "List signatures (full)"
test_endpoint "GET" "/api/signature-requests" "List signature requests"
test_endpoint "GET" "/api/sign-requests" "List sign requests"

echo ""
echo "✨ Test complete!"
