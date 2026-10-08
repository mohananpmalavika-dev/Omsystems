# AI Assistant V2 - Quick Start

Get the AI Assistant V2 up and running in 5 minutes.

## 1. Enable Feature Flag

```bash
# In your .env file
USE_ASSISTANT_V2=true
```

## 2. Register Routes

In your main app file (e.g., `src/app.ts`):

```typescript
import aiAssistantV2Routes from './routes/ai-assistant-v2.routes.js';

app.use('/api/ai-assistant-v2', aiAssistantV2Routes);
```

## 3. Test It

```bash
# Start your application
npm start

# Test health endpoint
curl http://localhost:3000/api/ai-assistant-v2/health

# Test a query
curl -X POST http://localhost:3000/api/ai-assistant-v2/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "What is the system status?",
    "sessionId": "test-session"
  }'
```

## 4. Verify No False Confirmations

Try a camera that doesn't exist:

```bash
curl -X POST http://localhost:3000/api/ai-assistant-v2/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "Start camera 9999",
    "sessionId": "test-session"
  }'
```

**Expected response:**
```json
{
  "success": false,
  "message": "Camera \"9999\" was not found.",
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Camera \"9999\" was not found.",
    "retryable": false
  }
}
```

**OLD ASSISTANT would have said:** 
```json
{
  "success": true,
  "message": "Camera 9999 has been started."  // ❌ FALSE!
}
```

**NEW ASSISTANT correctly says:**
```json
{
  "success": false,
  "message": "Camera \"9999\" was not found."  // ✅ TRUTHFUL!
}
```

## 5. Example Queries

Try these queries:

```bash
# System health
"What is the system status?"
"Show system health"
"Any active alerts?"

# Camera control
"Start camera 5"
"Stop camera entrance-1"
"Show camera status"

# Search
"Find people wearing red"
"Show vehicles detected today"
"Search for person at entrance"
```

## Common Issues

### Issue: "Feature is currently disabled"

**Solution:** Set `USE_ASSISTANT_V2=true` in environment variables

### Issue: "Database pool not available"

**Solution:** Ensure `req.app.locals.pool` is set in your Express app:

```typescript
app.locals.pool = yourDatabasePool;
```

### Issue: "Service unavailable"

**Solution:** Check that your database connection is working

### Issue: Commands not responding

**Solution:** Check that commands are registered in the route file

## Next Steps

1. ✅ Basic setup complete
2. Implement remaining service providers (see `INTEGRATION.md`)
3. Add more commands (investigation, analytics, reports)
4. Deploy to production with feature flag
5. Monitor for false confirmations (should be 0%)

## Architecture at a Glance

```
User Query
    ↓
Intent Parser (rule-based)
    ↓
Command Registry (resolves intent → command)
    ↓
Capability Check (validates service availability)
    ↓
Command Execution
    ├→ Resolve Resource (camera name → camera object)
    ├→ Authorize (user CAN control THIS camera?)
    ├→ Execute Service (with idempotency)
    ├→ Verify State (poll until confirmed)
    └→ Audit (log with evidence)
    ↓
Presenter (format as natural language)
    ↓
Response to User
```

## Key Principles

1. **Verified success requires evidence** (enforced by type system)
2. **Presenter cannot invent claims** (only formats service data)
3. **UNKNOWN is a valid state** (when data unavailable)
4. **Authorization after resolution** (enables resource-specific checks)
5. **Every operation is audited** (with evidence trail)

## Testing

Run the test suite:

```bash
cd analytics-engine/src/assistant
npm test

# With coverage
npm test -- --coverage
```

Expected: All tests pass with >80% coverage

## Documentation

- `README.md` - Architecture overview
- `INTEGRATION.md` - Full integration guide
- `DEPLOYMENT_GUIDE.md` - Production deployment steps
- `__tests__/README.md` - Testing strategy

## Success!

If you can query the assistant and it responds truthfully (no fake camera starts, no invented detection IDs), **you're done!**

The critical P0 issue is resolved. 🎉

## Questions?

Check the documentation or review the implementation:
- Types: `analytics-engine/src/assistant/types/`
- Commands: `analytics-engine/src/assistant/commands/`
- Services: `analytics-engine/src/assistant/services/`
- Tests: `analytics-engine/src/assistant/__tests__/`
