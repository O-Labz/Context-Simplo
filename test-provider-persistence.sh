#!/bin/bash

echo "🎯 Testing Provider Persistence & Highlighting"
echo "=============================================="
echo ""

echo "1️⃣  Current configuration (should show 'none' as active):"
CONFIG=$(curl -s http://localhost:3001/api/config)
echo "$CONFIG" | jq '{provider: .config.llmProvider, source: .source.llmProvider, envLocked: .envLocked.llmProvider}'
echo ""

echo "2️⃣  When you open http://localhost:3001/setup in your browser:"
echo "   ✅ The 'None' provider card should be HIGHLIGHTED"
echo "   ✅ It should have the 'selected' class with special styling"
echo "   ✅ Other providers (Ollama, OpenAI, Azure) should NOT be highlighted"
echo ""

echo "3️⃣  Testing config save (switching to Ollama):"
SAVE_RESULT=$(curl -X PUT http://localhost:3001/api/config \
  -H "Content-Type: application/json" \
  -d '{"llmBaseUrl": "http://localhost:11434", "llmEmbeddingModel": "nomic-embed-text"}' \
  -s)
echo "$SAVE_RESULT" | jq '.'
echo ""

echo "4️⃣  Note: llmProvider is ENV-LOCKED (set to 'none' via LLM_PROVIDER env var)"
echo "   This means you CANNOT change it via the dashboard"
echo "   The 'None' card will always be highlighted until you restart without LLM_PROVIDER"
echo ""

echo "5️⃣  To test full provider switching:"
echo "   a) Stop the server: pkill -f 'node dist/index.js'"
echo "   b) Restart WITHOUT LLM_PROVIDER env var:"
echo "      cd /Users/hopsonok/Documents/personal/Context-Simplo"
echo "      CONTEXT_SIMPLO_DATA_DIR=./data WORKSPACE_ROOT=. node dist/index.js"
echo "   c) Then you can switch providers via the dashboard"
echo "   d) The selected provider will be highlighted and persist across page reloads"
echo ""

echo "📊 Dashboard: http://localhost:3001/setup"
