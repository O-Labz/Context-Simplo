#!/bin/bash

echo "🔍 Testing Connection Validation (Should FAIL without LLM)"
echo "=========================================================="
echo ""

echo "1️⃣  Testing Ollama (should FAIL - not running):"
OLLAMA_TEST=$(curl -X POST http://localhost:3001/api/config/test-connection \
  -H "Content-Type: application/json" \
  -d '{"provider": "ollama", "baseUrl": "http://localhost:11434", "model": "nomic-embed-text"}' \
  -s)
echo "$OLLAMA_TEST" | jq '.'
if echo "$OLLAMA_TEST" | jq -e '.success == false' > /dev/null; then
  echo "✅ CORRECT: Ollama test failed as expected"
else
  echo "❌ BUG: Ollama test passed when it shouldn't!"
fi
echo ""

echo "2️⃣  Testing OpenAI (should FAIL - invalid API key):"
OPENAI_TEST=$(curl -X POST http://localhost:3001/api/config/test-connection \
  -H "Content-Type: application/json" \
  -d '{"provider": "openai", "apiKey": "sk-fake-key-12345", "baseUrl": "https://api.openai.com/v1", "model": "text-embedding-3-small"}' \
  -s)
echo "$OPENAI_TEST" | jq '.'
if echo "$OPENAI_TEST" | jq -e '.success == false' > /dev/null; then
  echo "✅ CORRECT: OpenAI test failed as expected"
else
  echo "❌ BUG: OpenAI test passed when it shouldn't!"
fi
echo ""

echo "3️⃣  Testing Azure (should FAIL - invalid endpoint):"
AZURE_TEST=$(curl -X POST http://localhost:3001/api/config/test-connection \
  -H "Content-Type: application/json" \
  -d '{"provider": "azure", "apiKey": "fake-key", "baseUrl": "https://fake-endpoint.openai.azure.com/", "model": "text-embedding-ada-002"}' \
  -s)
echo "$AZURE_TEST" | jq '.'
if echo "$AZURE_TEST" | jq -e '.success == false' > /dev/null; then
  echo "✅ CORRECT: Azure test failed as expected"
else
  echo "❌ BUG: Azure test passed when it shouldn't!"
fi
echo ""

echo "📝 Summary:"
echo "   All connection tests should FAIL when LLM providers are not configured"
echo "   This prevents users from saving invalid configurations"
echo ""
echo "💡 To test with real providers:"
echo "   1. Start Ollama: ollama serve"
echo "   2. Pull a model: ollama pull nomic-embed-text"
echo "   3. Test again - Ollama should pass"
echo "   4. For OpenAI: Use a real API key"
