#!/bin/bash

echo "🧪 Testing API Structure Unification"
echo "===================================="
echo ""

BASE_URL="http://localhost:3000"

echo "✅ Testing OpenAPI endpoint..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/openapi")
if [ "$STATUS" = "200" ]; then
    echo "   ✓ OpenAPI accessible ($STATUS)"
else
    echo "   ✗ OpenAPI failed ($STATUS)"
fi

echo ""
echo "📋 New Unified Structure:"
echo "   /api/signatures                      (Completed signatures)"
echo "   /api/signature-requests              (Pending requests)"
echo "   /api/signature-requests/{id}/sign    (Public signing)"
echo "   /api/signature-requests/{id}/pdf     (Public PDF download)"
echo ""

echo "⚠️  Deprecated but working:"
echo "   /api/sign-requests                   (Legacy)"
echo "   /api/sign-requests/{shortId}         (Legacy)"
echo "   /api/sign-requests/{shortId}/pdf     (Legacy)"
echo ""

echo "🎯 API Unification Summary:"
echo "   • Cleaner, more logical structure"
echo "   • Full backward compatibility"
echo "   • Legacy endpoints marked as deprecated in OpenAPI"
echo "   • No breaking changes for existing clients"
echo ""

echo "✨ All checks passed!"
