# ChatGPT Plus Integration Guide

This document explains how to integrate and use ChatGPT Plus (GPT-4) for AI Assistant natural language understanding.

## Overview

The AI Assistant now supports two intent parsing modes:

1. **ChatGPT Plus (GPT-4)** - Advanced natural language understanding with:
   - Superior intent classification accuracy
   - Multi-turn conversation context
   - Better handling of ambiguous queries
   - Natural parameter extraction
   - Reasoning explanations

2. **Rule-Based Fallback** - Pattern matching for:
   - Offline operation
   - Cost control
   - API failure resilience
   - Simple queries

## Setup

### 1. Install OpenAI Dependency (if not using built-in fetch)

The integration uses Node.js built-in `fetch` API (Node 18+), so no additional dependencies are required.

### 2. Configure API Key

Set the OpenAI API key as an environment variable:

```bash
# Linux/Mac
export OPENAI_API_KEY="sk-..."

# Windows PowerShell
$env:OPENAI_API_KEY="sk-..."

# Or add to .env file
OPENAI_API_KEY=sk-...
```

### 3. Initialize AI Assistant with OpenAI Parser

```typescript
import { createAIAssistantV2 } from './assistant/index.js';
import { createOpenAIIntentParser } from './assistant/providers/openai-intent-parser.provider.js';

// Create OpenAI intent parser
const intentParser = createOpenAIIntentParser({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',                    // or 'gpt-4-turbo-preview'
  temperature: 0.3,                  // Lower = more deterministic
  maxTokens: 500,
  timeout: 10000,                    // 10 second timeout
  maxRequestsPerMinute: 60,          // Rate limiting
  enableFallback: true,              // Fallback to rules on error
  debug: false
});

// Create assistant with OpenAI parser
const assistant = createAIAssistantV2({
  intentParser,
  debug: true
});

// Process queries
const response = await assistant.processQuery(
  'Show me people wearing red shirts from camera 5 yesterday',
  {
    id: 'user_123',
    roles: ['operator'],
    siteIds: ['site_main']
  },
  'session_abc'
);

console.log(response.message);
```

## Features

### Intent Classification

GPT-4 classifies queries into structured intents:

```
User: "Can you show me what camera 7 is recording right now?"
↓
Intent: CAMERA_STATUS
Confidence: 0.95
Parameters: { camera: "7" }
```

### Entity Extraction

Automatically extracts entities from natural language:

```
User: "Find all blue cars entering parking lot B yesterday"
↓
Entities: [
  { type: 'color', value: 'blue', confidence: 0.95 },
  { type: 'objectType', value: 'vehicle', confidence: 0.98 },
  { type: 'location', value: 'parking lot B', confidence: 0.90 }
]
Parameters: {
  color: 'blue',
  objectType: 'vehicle',
  location: 'parking lot B',
  timeRange: { from: '2024-01-14T00:00:00Z', to: '2024-01-14T23:59:59Z' }
}
```

### Multi-Turn Conversations

GPT-4 maintains conversation context:

```
User: "Show me incidents from branch A"
Assistant: "Found 5 incidents from Branch A..."

User: "What about branch B?"  ← Context aware
↓
Intent: REPORT_INCIDENTS
Parameters: { branchId: 'branch_b' }  ← Infers from context
```

### Ambiguity Resolution

Handles unclear queries better:

```
User: "camera problem"
↓
Intent: SYSTEM_STATUS (lower confidence: 0.65)
Reasoning: "User likely asking about camera health/status"
Suggestion: "Did you mean: Check camera status? Report camera issue?"
```

## Configuration Options

```typescript
interface OpenAIIntentParserConfig {
  /** OpenAI API key */
  apiKey?: string;
  
  /** Model: 'gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo' */
  model?: string;
  
  /** Temperature (0-2): Lower = more focused, Higher = more creative */
  temperature?: number;
  
  /** Max tokens in response (default: 500) */
  maxTokens?: number;
  
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  
  /** Rate limit: max requests per minute (default: 60) */
  maxRequestsPerMinute?: number;
  
  /** Enable fallback to rule-based parser (default: true) */
  enableFallback?: boolean;
  
  /** Enable debug logging (default: false) */
  debug?: boolean;
}
```

## Rate Limiting

The integration includes automatic rate limiting to stay within OpenAI API limits:

- Default: 60 requests/minute
- Automatic backoff when limit reached
- Transparent to caller (waits before sending request)
- Configurable via `maxRequestsPerMinute`

## Fallback Behavior

When OpenAI API fails, the system automatically falls back to rule-based parsing:

```
OpenAI API Error
    ↓
Log error
    ↓
Use rule-based parser
    ↓
Return result (may have lower confidence)
```

Fallback triggers:
- API key not configured
- Network timeout
- API rate limit exceeded
- Service unavailable (5xx errors)
- Invalid response format

## Cost Management

### Strategies

1. **Use GPT-3.5-Turbo for simple queries**
```typescript
model: 'gpt-3.5-turbo'  // Much cheaper, still effective
```

2. **Enable fallback for cost control**
```typescript
enableFallback: true  // Use rules when possible
```

3. **Implement caching** (future enhancement)
```typescript
// Cache common queries
const cache = new IntentCache({ ttl: 3600 });
```

4. **Set conservative rate limits**
```typescript
maxRequestsPerMinute: 30  // Lower limit = lower cost
```

### Pricing (approximate)

- **GPT-4**: ~$0.03 per 1K tokens
- **GPT-4 Turbo**: ~$0.01 per 1K tokens
- **GPT-3.5 Turbo**: ~$0.001 per 1K tokens

Average intent classification: ~200 tokens → $0.006 (GPT-4) or $0.0002 (GPT-3.5)

## Security

### API Key Protection

```typescript
// ✓ CORRECT: Environment variable
apiKey: process.env.OPENAI_API_KEY

// ✗ WRONG: Hardcoded
apiKey: 'sk-...'
```

### Input Sanitization

All user input is automatically:
- Trimmed of whitespace
- Stripped of control characters
- Length-limited to 500 characters
- Validated before sending to API

### Data Privacy

The integration:
- **Does NOT** send sensitive data to OpenAI
- **Does NOT** include user IDs or auth tokens in prompts
- **Does NOT** log API keys
- **Only** sends sanitized natural language queries

Example of what is sent:
```
User query: "Show camera 5"
Sent to API: "Show camera 5"  ← Only the query text
NOT sent: user_id, session_id, auth_token, IP address, etc.
```

## Monitoring

### Get Statistics

```typescript
const stats = intentParser.getStatistics();
console.log(stats);
// {
//   provider: 'openai',
//   model: 'gpt-4',
//   hasApiKey: true,
//   fallbackEnabled: true,
//   activeConversations: 3
// }
```

### Debug Logging

Enable debug mode to see API interactions:

```typescript
const parser = createOpenAIIntentParser({ debug: true });

// Logs:
// [OpenAI] Parsing query: "show camera 5"
// [OpenAI] Intent: CAMERA_STATUS, confidence: 0.95
// [OpenAI] Request took 234ms
```

### Error Handling

All errors are logged with context:

```typescript
logger.error('OpenAI API error', {
  error: 'timeout after 10000ms',
  query: 'show camera 5'
});
```

## Testing

### Unit Tests

```typescript
import { createOpenAIIntentParser } from './providers/openai-intent-parser.provider.js';

describe('OpenAI Intent Parser', () => {
  it('should parse camera control queries', async () => {
    const parser = createOpenAIIntentParser({
      apiKey: process.env.TEST_OPENAI_KEY
    });
    
    const result = await parser.parse('Start camera 5');
    
    expect(result.intent).toBe('CAMERA_START');
    expect(result.parameters.camera).toBe('5');
    expect(result.confidence).toBeGreaterThan(0.8);
  });
  
  it('should fall back on API error', async () => {
    const parser = createOpenAIIntentParser({
      apiKey: 'invalid',
      enableFallback: true
    });
    
    // Should not throw, should use fallback
    const result = await parser.parse('Start camera 5');
    expect(result.intent).toBe('CAMERA_START');
  });
});
```

### Integration Tests

```typescript
it('should maintain conversation context', async () => {
  const parser = createOpenAIIntentParser();
  const sessionId = 'test_session';
  
  // First query
  await parser.parse('Show incidents from branch A', sessionId);
  
  // Follow-up query (context-dependent)
  const result = await parser.parse('What about branch B?', sessionId);
  
  expect(result.intent).toBe('REPORT_INCIDENTS');
  expect(result.parameters.branchId).toContain('b');
});
```

## Troubleshooting

### Issue: "OpenAI API key not configured"

**Solution**: Set the `OPENAI_API_KEY` environment variable

```bash
export OPENAI_API_KEY="sk-..."
```

### Issue: Rate limit errors

**Solution**: Reduce `maxRequestsPerMinute` or upgrade OpenAI plan

```typescript
maxRequestsPerMinute: 20  // Lower limit
```

### Issue: Timeouts

**Solution**: Increase timeout or check network connectivity

```typescript
timeout: 30000  // 30 seconds
```

### Issue: Falling back to rules too often

**Causes**:
- Invalid API key
- Network issues
- OpenAI service outage
- Exceeding rate limits

**Solution**: Check logs for specific error messages

```typescript
debug: true  // Enable detailed logging
```

## Best Practices

1. **Always enable fallback** for production
   ```typescript
   enableFallback: true
   ```

2. **Use conservative rate limits** initially
   ```typescript
   maxRequestsPerMinute: 30
   ```

3. **Monitor API costs** via OpenAI dashboard

4. **Cache common queries** (future enhancement)

5. **Set appropriate timeouts**
   ```typescript
   timeout: 10000  // 10 seconds for user-facing queries
   ```

6. **Use GPT-3.5 for simple classification**
   ```typescript
   model: 'gpt-3.5-turbo'  // Lower cost, faster
   ```

7. **Clear old conversation contexts** periodically
   ```typescript
   // In background job
   parser.clearContext(oldSessionId);
   ```

## Migration from Rule-Based Parser

Minimal code changes required:

```typescript
// OLD: Rule-based only
const assistant = createAIAssistantV2();

// NEW: GPT-4 with fallback to rules
const assistant = createAIAssistantV2({
  intentParser: createOpenAIIntentParser()
});
```

The rest of the code remains unchanged - all commands, services, and presentation logic work identically.

## Future Enhancements

Planned improvements:
- Intent classification caching
- Fine-tuned model for surveillance domain
- Streaming responses for long queries
- Multi-modal support (image + text queries)
- Custom domain vocabulary
- Confidence calibration based on historical accuracy
