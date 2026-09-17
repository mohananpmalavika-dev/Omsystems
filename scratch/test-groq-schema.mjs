import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
let apiKey = '';
for (const line of env.split('\n')) {
  if (line.startsWith('GROQ_API_KEY=')) {
    apiKey = line.split('=')[1].trim();
  }
}

const GUARDIAN_FUNCTIONS = [
  {
    name: "show_camera_feed",
    description: "Display live feed from specific cameras",
    parameters: {
      type: "object",
      properties: {
        cameraIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of camera IDs to display",
        },
        layout: {
          type: ["string", "null"],
          enum: ["single", "grid", "mosaic", null],
          description: "Display layout for multiple cameras",
        },
      },
      required: ["cameraIds"],
    },
  },
  {
    name: "lock_doors",
    description: "Lock doors in specified locations",
    parameters: {
      type: "object",
      properties: {
        locations: {
          type: "array",
          items: { type: "string" },
          description: "Locations where doors should be locked (e.g., 'floor 3', 'main entrance')",
        },
        reason: {
          type: ["string", "null"],
          description: "Reason for locking doors",
        },
      },
      required: ["locations"],
    },
  },
  {
    name: "dispatch_guard",
    description: "Dispatch security guard to a location",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Location where guard should be dispatched",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Priority level of dispatch",
        },
        reason: {
          type: ["string", "null"],
          description: "Reason for dispatch",
        },
      },
      required: ["location", "priority"],
    },
  },
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
  {
    name: "search_person",
    description: "Search for a person across all cameras",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Description of the person (e.g., 'man in red shirt')",
        },
        timeRange: {
          type: ["string", "null"],
          description: "Time range to search (e.g., 'last 2 hours')",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "get_branch_status",
    description: "Get operational status of branches",
    parameters: {
      type: "object",
      properties: {
        branchIds: {
          type: ["array", "null"],
          items: { type: "string" },
          description: "Specific branch IDs, or empty for all branches",
        },
      },
    },
  },
  {
    name: "trigger_alarm",
    description: "Trigger alarm or announcement",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["siren", "announcement", "silent"],
          description: "Type of alarm to trigger",
        },
        location: {
          type: "string",
          description: "Location where alarm should sound",
        },
        message: {
          type: ["string", "null"],
          description: "Custom message for announcement",
        },
      },
      required: ["type", "location"],
    },
  },
  {
    name: "analyze_incident",
    description: "Analyze a security incident using AI",
    parameters: {
      type: "object",
      properties: {
        incidentId: {
          type: "string",
          description: "ID of the incident to analyze",
        },
        includeContext: {
          type: ["boolean", "null"],
          description: "Include surrounding context (before/after footage)",
        },
      },
      required: ["incidentId"],
    },
  },
  {
    name: "get_camera_locations",
    description: "Get list of camera locations or find cameras near a location",
    parameters: {
      type: "object",
      properties: {
        nearLocation: {
          type: ["string", "null"],
          description: "Find cameras near this location (e.g., 'parking lot', 'entrance')",
        },
        type: {
          type: ["string", "null"],
          enum: ["all", "indoor", "outdoor", "ptz", null],
          description: "Filter by camera type",
        },
      },
    },
  },
];

async function testPrompt(userPrompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: userPrompt }],
      tools: GUARDIAN_FUNCTIONS.map(f => ({ type: 'function', function: f })),
      tool_choice: 'auto'
    })
  });
  console.log(`Prompt: "${userPrompt}" -> Status: ${res.status}`);
  const data = await res.json();
  if (res.status !== 200) {
    console.log('Error:', JSON.stringify(data.error));
  } else {
    console.log('Choice message:', JSON.stringify(data.choices[0].message, null, 2));
  }
}

async function run() {
  await testPrompt('Show me camera status');
  await testPrompt('How many alerts are open?');
  await testPrompt('What is the system health?');
}

run();
