/**
 * ChatGPT Plus Integration Test Example
 * 
 * This example demonstrates how to use the ChatGPT-powered AI assistant.
 * 
 * To run this example:
 * 1. Copy .env.chatgpt.example to .env
 * 2. Add your OpenAI API key to .env
 * 3. Run: tsx src/assistant/test-chatgpt.example.ts
 */

import { createAIAssistantV2 } from './ai-assistant-v2.js';
import { createOpenAIIntentParser } from './providers/openai-intent-parser.provider.js';

// Load environment variables
import { config } from 'dotenv';
config();

/**
 * Example 1: Basic ChatGPT Integration
 */
async function example1Basic() {
  console.log('\n=== Example 1: Basic ChatGPT Integration ===\n');
  
  // Create OpenAI intent parser
  const intentParser = createOpenAIIntentParser({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    temperature: 0.3,
    debug: true  // See what's happening
  });
  
  // Create assistant with OpenAI parser
  const assistant = createAIAssistantV2({
    intentParser,
    debug: true
  });
  
  // Test query
  const query = 'Show me all people wearing red shirts from camera 5 yesterday';
  
  console.log(`Query: "${query}"\n`);
  
  const response = await assistant.processQuery(
    query,
    {
      id: 'user_123',
      roles: ['operator'],
      siteIds: ['site_main']
    },
    'session_001'
  );
  
  console.log('Response:', response.message);
  console.log('Success:', response.success);
  console.log('Intent:', response.intent);
  console.log('\n');
}

/**
 * Example 2: Multi-Turn Conversation
 */
async function example2Conversation() {
  console.log('\n=== Example 2: Multi-Turn Conversation ===\n');
  
  const intentParser = createOpenAIIntentParser({
    apiKey: process.env.OPENAI_API_KEY,
    debug: true
  });
  
  const assistant = createAIAssistantV2({ intentParser, debug: true });
  
  const sessionId = 'session_002';
  const user = {
    id: 'user_123',
    roles: ['operator'],
    siteIds: ['site_main']
  };
  
  // First query
  console.log('Query 1: "Show me incidents from branch A"\n');
  let response = await assistant.processQuery(
    'Show me incidents from branch A',
    user,
    sessionId
  );
  console.log('Response:', response.message, '\n');
  
  // Follow-up query (context-aware)
  console.log('Query 2: "What about branch B?" (context-aware)\n');
  response = await assistant.processQuery(
    'What about branch B?',
    user,
    sessionId
  );
  console.log('Response:', response.message, '\n');
  
  // Another follow-up
  console.log('Query 3: "Show me from last week"\n');
  response = await assistant.processQuery(
    'Show me from last week',
    user,
    sessionId
  );
  console.log('Response:', response.message, '\n');
}

/**
 * Example 3: Comparison with Rule-Based Parser
 */
async function example3Comparison() {
  console.log('\n=== Example 3: Comparison with Rule-Based Parser ===\n');
  
  // Create both parsers
  const gptParser = createOpenAIIntentParser({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4'
  });
  
  const ruleParser = createOpenAIIntentParser({
    apiKey: '', // No API key = fallback only
    enableFallback: true
  });
  
  const complexQuery = 'Can you show me if there were any people in blue clothing near the main entrance around 3 PM yesterday?';
  
  console.log(`Query: "${complexQuery}"\n`);
  
  // Parse with GPT-4
  console.log('GPT-4 Parsing:');
  const gptResult = await gptParser.parse(complexQuery);
  console.log('  Intent:', gptResult.intent);
  console.log('  Confidence:', gptResult.confidence);
  console.log('  Parameters:', JSON.stringify(gptResult.parameters, null, 2));
  console.log('  Reasoning:', gptResult.reasoning);
  console.log('');
  
  // Parse with rules
  console.log('Rule-Based Parsing:');
  const ruleResult = await ruleParser.parse(complexQuery);
  console.log('  Intent:', ruleResult.intent);
  console.log('  Confidence:', ruleResult.confidence);
  console.log('  Parameters:', JSON.stringify(ruleResult.parameters, null, 2));
  console.log('');
}

/**
 * Example 4: Handling Ambiguous Queries
 */
async function example4Ambiguity() {
  console.log('\n=== Example 4: Handling Ambiguous Queries ===\n');
  
  const intentParser = createOpenAIIntentParser({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    debug: true
  });
  
  // Ambiguous queries
  const queries = [
    'camera problem',
    'show me stuff',
    'what happened',
    'check things'
  ];
  
  for (const query of queries) {
    console.log(`Query: "${query}"`);
    
    const result = await intentParser.parse(query);
    
    console.log('  Intent:', result.intent);
    console.log('  Confidence:', result.confidence);
    console.log('  Reasoning:', result.reasoning);
    console.log('');
  }
}

/**
 * Example 5: Rate Limiting
 */
async function example5RateLimit() {
  console.log('\n=== Example 5: Rate Limiting ===\n');
  
  const intentParser = createOpenAIIntentParser({
    apiKey: process.env.OPENAI_API_KEY,
    maxRequestsPerMinute: 3,  // Very low limit for demonstration
    debug: true
  });
  
  console.log('Sending 5 queries with rate limit of 3/minute...\n');
  
  const queries = [
    'Show camera 1',
    'Show camera 2',
    'Show camera 3',
    'Show camera 4',  // Should wait here
    'Show camera 5'
  ];
  
  const startTime = Date.now();
  
  for (let i = 0; i < queries.length; i++) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] Query ${i + 1}: "${queries[i]}"`);
    
    await intentParser.parse(queries[i]);
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${totalTime}s (rate limiting added delay)`);
}

/**
 * Example 6: Error Handling and Fallback
 */
async function example6Fallback() {
  console.log('\n=== Example 6: Error Handling and Fallback ===\n');
  
  // Parser with invalid API key (will fallback to rules)
  const intentParser = createOpenAIIntentParser({
    apiKey: 'invalid_key',
    enableFallback: true,
    debug: true
  });
  
  const query = 'Start camera 5';
  
  console.log(`Query: "${query}"`);
  console.log('Using invalid API key - should fallback to rules\n');
  
  const result = await intentParser.parse(query);
  
  console.log('Intent:', result.intent);
  console.log('Confidence:', result.confidence);
  console.log('Success:', result.intent !== 'UNKNOWN');
  console.log('\nFallback worked! Query still processed.\n');
}

/**
 * Example 7: Statistics and Monitoring
 */
async function example7Statistics() {
  console.log('\n=== Example 7: Statistics and Monitoring ===\n');
  
  const intentParser = createOpenAIIntentParser({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  // Process some queries
  await intentParser.parse('Show camera 1', 'session_1');
  await intentParser.parse('What about camera 2?', 'session_1');
  await intentParser.parse('Start camera 3', 'session_2');
  
  // Get statistics
  const stats = intentParser.getStatistics();
  
  console.log('Parser Statistics:');
  console.log(JSON.stringify(stats, null, 2));
  console.log('');
}

/**
 * Main function - run all examples
 */
async function main() {
  console.log('ChatGPT Plus Integration Examples');
  console.log('='.repeat(50));
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('\n❌ Error: OPENAI_API_KEY not set in environment');
    console.error('Please set your API key in .env file or environment variable\n');
    process.exit(1);
  }
  
  try {
    await example1Basic();
    await example2Conversation();
    await example3Comparison();
    await example4Ambiguity();
    await example5RateLimit();
    await example6Fallback();
    await example7Statistics();
    
    console.log('\n✓ All examples completed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  example1Basic,
  example2Conversation,
  example3Comparison,
  example4Ambiguity,
  example5RateLimit,
  example6Fallback,
  example7Statistics
};
