#!/bin/bash

echo "🔥 Testing Configuration Hot Reload"
echo "===================================="
echo ""

echo "1️⃣  Checking server health..."
curl -s http://localhost:3001/api/health | jq -r '"Status: \(.status) | Uptime: \(.uptime)ms"'
echo ""

echo "2️⃣  Getting current configuration..."
curl -s http://localhost:3001/api/config | jq '.config'
echo ""

echo "3️⃣  Testing hot reload: Updating embedding concurrency to 15..."
RESPONSE=$(curl -X PUT http://localhost:3001/api/config \
  -H "Content-Type: application/json" \
  -d '{"embeddingConcurrency": 15, "embeddingBatchSize": 35}' \
  -s)

echo "$RESPONSE" | jq '.'
echo ""

if echo "$RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✅ Configuration updated successfully!"
  echo "   Updated fields: $(echo "$RESPONSE" | jq -r '.updated | join(", ")')"
else
  echo "❌ Configuration update failed!"
  echo "   Error: $(echo "$RESPONSE" | jq -r '.error // .reloadError')"
fi
echo ""

echo "4️⃣  Verifying new configuration..."
sleep 1
curl -s http://localhost:3001/api/config | jq '.config'
echo ""

echo "5️⃣  Server is still healthy (no restart needed)..."
curl -s http://localhost:3001/api/health | jq -r '"Status: \(.status) | Uptime: \(.uptime)ms"'
echo ""

echo "🎉 Hot reload test complete!"
echo ""
echo "📊 Dashboard available at: http://localhost:3001"
echo "⚙️  Setup page: http://localhost:3001/setup"
