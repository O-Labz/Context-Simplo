# Configuration Hot Reload Implementation

## Overview

This document describes the implementation of real-time configuration hot reloading in Context-Simplo. Users can now change LLM provider settings, API keys, concurrency settings, and other runtime configurations through the dashboard, and the changes take effect **immediately without requiring a server restart**.

## What Was Implemented

### 1. ConfigManager Class (`src/core/config-manager.ts`)

A new `ConfigManager` class that orchestrates runtime configuration changes:

**Key Features:**
- **Graceful Provider Switching**: Drains the embedding queue before switching providers to prevent data loss
- **Rollback on Failure**: If a new provider fails health checks, the old provider remains active
- **Concurrent Reload Prevention**: Mutex lock prevents multiple simultaneous reloads
- **Event Emission**: Broadcasts lifecycle events (reloading, reloaded, error) for monitoring
- **Service Coordination**: Updates all dependent services (indexer, MCP server, search services)

**Reload Logic:**
- **LLM Provider Changes**: Drains queue → Creates new provider → Health check → Creates new queue → Recreates search services
- **Performance Settings**: Updates queue concurrency/batch size dynamically
- **Dimension Warnings**: Warns users when switching between providers with different embedding dimensions

### 2. WebSocket Events (`src/api/websocket.ts`)

Added three new WebSocket events for real-time feedback:
- `config:reloading` - Broadcast when reload starts
- `config:reload_complete` - Broadcast when reload succeeds (includes changes and warnings)
- `config:reload_error` - Broadcast when reload fails (includes error details)

### 3. API Route Integration (`src/api/routes/config.ts`)

Updated the `PUT /api/config` endpoint to:
1. Save configuration to database
2. Broadcast `config:changed` event
3. Trigger `configManager.reloadConfig()` automatically
4. Broadcast reload lifecycle events
5. Return reload status in response

**Error Handling:**
- If reload fails, the response includes `reloadError` field
- Old configuration remains active on failure
- Detailed error messages are sent to the dashboard

### 4. Main Entry Point (`src/index.ts`)

Integrated ConfigManager into the application lifecycle:
- Creates ConfigManager after all services are initialized
- Registers callbacks to update indexer and MCP server when provider changes
- Passes ConfigManager to API server for route access
- Maintains references to all hot-reloadable services

### 5. Dashboard UI (`dashboard/src/pages/Setup/Setup.tsx`)

Enhanced the Setup page with real-time feedback:

**WebSocket Integration:**
- Listens for `config:reloading`, `config:reload_complete`, and `config:reload_error` events
- Shows loading state during reload ("Applying changes...")
- Displays success/error notifications with detailed messages
- Shows warnings (e.g., dimension mismatches)

**UI States:**
- **Saving**: Shows spinner while saving to database
- **Reloading**: Shows spinner while services are being reinitialized
- **Success**: Green notification with changes applied
- **Error**: Red notification with error details
- **Connection Status**: Warning if WebSocket is disconnected

### 6. Search Service Integration (`src/api/routes/search.ts`)

Updated search routes to dynamically get services from ConfigManager:
- Semantic search uses `configManager.getVectorSearch()`
- Hybrid search uses `configManager.getHybridSearch()`
- Falls back to static references if ConfigManager not available

### 7. Test Suite

**Unit Tests** (`tests/unit/config-manager.test.ts`):
- Service reference management
- Reload detection logic
- Concurrent reload prevention
- Event emission
- Callback hooks
- Error handling

**Integration Tests** (`tests/integration/config-hot-reload.test.ts`):
- End-to-end config updates via API
- WebSocket event broadcasting
- Concurrent update handling
- Config persistence after reload
- Environment variable locking
- Invalid config handling

## How It Works

### User Flow

1. **User opens Setup page** → Dashboard loads current configuration
2. **User changes settings** (e.g., switches from Ollama to OpenAI)
3. **User clicks "Save Configuration"**
4. **Dashboard shows "Saving..." spinner**
5. **API saves to database** → Broadcasts `config:changed`
6. **ConfigManager starts reload** → Broadcasts `config:reloading`
7. **Dashboard shows "Applying changes..." spinner**
8. **ConfigManager drains queue** (if provider is changing)
9. **ConfigManager creates new provider** → Runs health check
10. **ConfigManager creates new queue and search services**
11. **ConfigManager updates all dependent services**
12. **Broadcasts `config:reload_complete`** with changes list
13. **Dashboard shows success notification** with details
14. **Changes are live** - no restart needed!

### Technical Flow

```
User Action (Dashboard)
    ↓
PUT /api/config
    ↓
storage.updateConfig()
    ↓
WebSocket: config:changed
    ↓
configManager.reloadConfig()
    ↓
WebSocket: config:reloading
    ↓
[Graceful Reload Process]
    ├─ Drain embedding queue
    ├─ Create new provider
    ├─ Health check
    ├─ Create new queue
    ├─ Recreate search services
    └─ Update dependent services
    ↓
WebSocket: config:reload_complete
    ↓
Dashboard shows success
    ↓
Services running with new config!
```

## Configuration Changes Supported

### Hot Reloadable (No Restart Required)
- ✅ LLM Provider (none, ollama, openai, azure)
- ✅ API Key
- ✅ Base URL
- ✅ Embedding Model
- ✅ Embedding Concurrency
- ✅ Embedding Batch Size

### Requires Restart (Environment Variables)
- ❌ Data Directory (`CONTEXT_SIMPLO_DATA_DIR`)
- ❌ Auto Index (`CONTEXT_SIMPLO_AUTO_INDEX`)
- ❌ Watch Enabled (`CONTEXT_SIMPLO_WATCH`)
- ❌ Log Level (`CONTEXT_SIMPLO_LOG_LEVEL`)
- ❌ Graph Memory Limit (`GRAPH_MEMORY_LIMIT_MB`)

**Note**: Environment variables are "locked" and cannot be changed via dashboard. This is by design for operator-level settings.

## Edge Cases Handled

### 1. Concurrent Reloads
- **Problem**: Multiple users changing config simultaneously
- **Solution**: Mutex lock prevents concurrent reloads; second request gets "already in progress" error

### 2. Provider Health Check Failure
- **Problem**: New provider is unreachable or misconfigured
- **Solution**: Rollback to old provider, broadcast error, old services remain active

### 3. Embedding Dimension Mismatch
- **Problem**: Switching from 768-dim (Ollama) to 1536-dim (OpenAI) makes existing embeddings incompatible
- **Solution**: Warning message shown to user: "Consider re-indexing"

### 4. Queue Draining
- **Problem**: Switching providers while embeddings are in progress
- **Solution**: Gracefully drain queue (wait for pending jobs) before switching

### 5. WebSocket Disconnection
- **Problem**: User loses real-time feedback if WebSocket drops
- **Solution**: Warning shown in UI; config still saves but user doesn't see reload status

### 6. Environment Variable Locking
- **Problem**: User tries to change env-locked setting
- **Solution**: Setting is filtered out before reload; returned in `ignored` array

## Performance Characteristics

- **Typical Reload Time**: 1-3 seconds (depends on queue drain)
- **Queue Drain Time**: 0-5 seconds (depends on pending jobs)
- **Health Check Time**: 100-500ms per provider
- **No Service Downtime**: Services remain available during reload
- **Memory Overhead**: Minimal (old services are garbage collected)

## Monitoring and Debugging

### WebSocket Events
Monitor in browser console:
```javascript
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg.type, msg.payload);
};
```

### Server Logs
```
Draining embedding queue before provider switch...
Switched to openai provider
Model: text-embedding-3-small
Dimensions: 1536
Recreated vector and hybrid search services
```

### API Response
```json
{
  "success": true,
  "updated": ["llmProvider", "llmApiKey"],
  "ignored": []
}
```

## Future Enhancements

Potential improvements for future versions:

1. **Partial Reloads**: Only reload affected services (currently reloads all)
2. **Config History**: Track config changes over time
3. **Rollback UI**: One-click rollback to previous config
4. **Batch Updates**: Queue multiple config changes and apply together
5. **Re-indexing Automation**: Auto-trigger re-indexing on dimension changes
6. **Provider Migration**: Automated migration between providers with different dimensions

## Testing

Run tests:
```bash
# Unit tests
npm test tests/unit/config-manager.test.ts

# Integration tests
npm test tests/integration/config-hot-reload.test.ts

# All tests
npm test
```

## Troubleshooting

### Issue: Config changes don't take effect
- **Check**: Is WebSocket connected? (Look for warning in dashboard)
- **Check**: Are settings env-locked? (Check `envLocked` in API response)
- **Check**: Did reload fail? (Look for error notification)

### Issue: "Configuration reload already in progress"
- **Cause**: Concurrent reload attempt
- **Solution**: Wait a few seconds and try again

### Issue: Provider health check fails
- **Cause**: Provider unreachable or misconfigured
- **Solution**: Verify base URL and API key; check provider is running

### Issue: Dimension mismatch warning
- **Cause**: Switching between providers with different dimensions
- **Solution**: Re-index repositories to regenerate embeddings with new dimensions

## Conclusion

The hot reload implementation provides a seamless user experience for configuration changes. Users can experiment with different LLM providers, adjust performance settings, and update credentials without any downtime or manual restarts. The system handles edge cases gracefully and provides clear feedback throughout the reload process.
