# Testing Instructions - Configuration Hot Reload

## ✅ What Was Implemented

1. **Configuration Hot Reload** - Changes take effect immediately without restart
2. **Provider Persistence** - Selected provider is highlighted correctly
3. **Connection Validation** - Test connection properly validates credentials

## 🧪 How to Test

### Test 1: Provider Highlighting & Persistence

1. Open http://localhost:3001/setup
2. **Expected**: "None" provider should be highlighted (colored border/background)
3. Click on "Ollama"
4. Fill in settings (baseUrl: `http://localhost:11434`, model: `nomic-embed-text`)
5. Click "Save Configuration"
6. **Expected**: See "Saving..." → "Applying changes..." → Success message
7. Refresh the page or navigate away and back
8. **Expected**: "Ollama" should still be highlighted (not "None")

### Test 2: Connection Validation (Should FAIL)

**Without Ollama Running:**
1. Select "Ollama" provider
2. Enter baseUrl: `http://localhost:11434`
3. Enter model: `nomic-embed-text`
4. Click "Test Connection"
5. **Expected**: ❌ "Connection Failed" with error message
6. **Should NOT see**: ✅ "Connection Successful"

**With Invalid OpenAI Key:**
1. Select "OpenAI" provider
2. Enter API key: `sk-fake-key-12345`
3. Enter baseUrl: `https://api.openai.com/v1`
4. Enter model: `text-embedding-3-small`
5. Click "Test Connection"
6. **Expected**: ❌ "Connection Failed" with error message

### Test 3: Hot Reload (No Restart)

1. Note the server uptime: `curl http://localhost:3001/api/health | jq .uptime`
2. Change configuration in the dashboard
3. Click "Save Configuration"
4. Wait for success message
5. Check uptime again: `curl http://localhost:3001/api/health | jq .uptime`
6. **Expected**: Uptime increased (not reset) - proves no restart happened!

### Test 4: Real Provider Connection (If Available)

**If you have Ollama installed:**
```bash
# Start Ollama
ollama serve

# Pull a model
ollama pull nomic-embed-text
```

Then in the dashboard:
1. Select "Ollama"
2. Enter baseUrl: `http://localhost:11434`
3. Enter model: `nomic-embed-text`
4. Click "Test Connection"
5. **Expected**: ✅ "Connection Successful" with model info
6. Click "Save Configuration"
7. **Expected**: Hot reload happens, embeddings now work!

## 🐛 Known Issues (Now Fixed)

### ❌ BEFORE (Bugs):
- Connection test always passed (even with fake credentials)
- Provider selection didn't persist across page reloads
- Always defaulted to "Ollama" even when "None" was active
- Had to restart server for config changes

### ✅ AFTER (Fixed):
- Connection test properly validates credentials
- Provider selection persists correctly
- Shows actual active provider on page load
- Hot reload works - no restart needed!

## 📊 Server Status

Check if server is running:
```bash
curl http://localhost:3001/api/health
```

Check current configuration:
```bash
curl http://localhost:3001/api/config | jq '.config'
```

Check which provider is active:
```bash
curl http://localhost:3001/api/config | jq '.config.llmProvider'
```

## 🔧 Troubleshooting

**Issue**: Still seeing "Connection Successful" when it should fail
- **Solution**: Hard refresh the browser (Cmd+Shift+R or Ctrl+Shift+R)
- **Reason**: Browser cached the old JavaScript

**Issue**: Provider not highlighted correctly
- **Solution**: Check the API returns correct config: `curl http://localhost:3001/api/config`
- **Verify**: `config.llmProvider` matches what you expect

**Issue**: Changes don't take effect
- **Solution**: Check WebSocket is connected (look for warning in dashboard)
- **Verify**: Check browser console for WebSocket events

## ✨ Success Criteria

All these should work:
- ✅ Connection test FAILS with invalid credentials
- ✅ Connection test PASSES with valid credentials (if provider available)
- ✅ Provider highlighting persists across page reloads
- ✅ Hot reload works without server restart
- ✅ Real-time feedback shows progress (Saving → Applying → Success)
- ✅ Error messages are clear and helpful

## 🎉 You're Done!

If all tests pass, the hot reload implementation is working perfectly!

Dashboard: http://localhost:3001/setup
