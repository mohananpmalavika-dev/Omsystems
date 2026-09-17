import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
let apiKey = '';
for (const line of env.split('\n')) {
  if (line.startsWith('GROQ_API_KEY=')) {
    apiKey = line.split('=')[1].trim();
  }
}

async function testFullFlow() {
  const GUARDIAN_FUNCTIONS = [
    {
      name: "get_alert_summary",
      description: "Get summary of recent alerts",
      parameters: {
        type: "object",
        properties: {
          timeRange: {
            type: ["string", "null"],
            enum: ["1h", "4h", "24h", "7d", null],
            description: "Time range for alert summary",
          },
          severity: {
            type: ["string", "null"],
            enum: ["low", "medium", "high", "critical", null],
            description: "Filter by severity level",
          },
        },
      },
    },
  ];

  const history = [
    {
      role: "system",
      content: "You are KryptonAI, an advanced security assistant. When tools are called, summarize findings."
    },
    {
      role: "user",
      content: "How many alerts are open?"
    }
  ];

  // 1. Initial call
  const res1 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: history,
      tools: GUARDIAN_FUNCTIONS.map(f => ({ type: 'function', function: f })),
      tool_choice: 'auto'
    })
  });

  const data1 = await res1.json();
  console.log('Step 1 response status:', res1.status);
  const toolCall = data1.choices[0].message.tool_calls[0];
  console.log('Tool call received:', toolCall);

  // 2. Add assistant message and tool response
  history.push(data1.choices[0].message);
  history.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify({ total: 2, critical: 1, high: 1, breakdown: "1 critical server intrusion, 1 high perimeter alert" })
  });

  // 3. Followup call
  const res2 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: history
    })
  });

  console.log('Step 2 followup status:', res2.status);
  const data2 = await res2.json();
  if (res2.status !== 200) {
    console.log('Followup error:', data2);
  } else {
    console.log('Followup assistant message:', data2.choices[0].message.content);
  }
}

testFullFlow().catch(console.error);
