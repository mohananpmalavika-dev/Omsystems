# Root Cause Analysis Engine

AI-powered root cause analysis engine for OmSystems security platform.

## Features

- AI-powered incident analysis using OpenAI GPT-4
- Automated root cause identification
- Contributing factor analysis
- Actionable remediation recommendations
- Preventive measure suggestions
- Analysis caching for quick retrieval

## API Endpoints

### POST /api/v1/analyze
Analyze an incident to determine root cause.

**Request Body:**
```json
{
  "incidentId": "incident-123",
  "incidentData": {
    "type": "security_breach",
    "severity": "high",
    "description": "Unauthorized access detected",
    "cameraId": "cam-001",
    "location": "Building A - Entrance",
    "metadata": {
      "timestamp": "2026-07-31T09:00:00Z",
      "user": "unknown"
    },
    "relatedIncidents": ["incident-120", "incident-121"],
    "systemLogs": [
      "2026-07-31 09:00:00 - Failed login attempt",
      "2026-07-31 09:00:15 - Access granted with unknown credential"
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "incidentId": "incident-123",
  "analysis": {
    "incidentId": "incident-123",
    "timestamp": "2026-07-31T09:30:00.000Z",
    "rootCause": "Compromised credentials allowed unauthorized access",
    "contributingFactors": [
      "Weak password policy",
      "No multi-factor authentication",
      "Insufficient access logging"
    ],
    "remediationSteps": [
      "Immediately revoke compromised credentials",
      "Force password reset for all users",
      "Enable multi-factor authentication"
    ],
    "preventiveMeasures": [
      "Implement strong password policy",
      "Deploy MFA across all systems",
      "Enhance access monitoring and alerting"
    ],
    "confidence": 0.85,
    "rawAnalysis": "..."
  }
}
```

### GET /api/v1/analysis/:incidentId
Retrieve analysis results for a specific incident.

**Response:**
```json
{
  "success": true,
  "incidentId": "incident-123",
  "analysis": { ... }
}
```

## Environment Variables

```bash
PORT=3004
NODE_ENV=production
OPENAI_API_KEY=your_openai_api_key_here
LOG_LEVEL=info
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test
```

## Docker

```bash
# Build image
docker build -t root-cause-analysis-engine:latest .

# Run container
docker run -p 3004:3004 \
  -e OPENAI_API_KEY=your_key_here \
  root-cause-analysis-engine:latest
```

## Integration with OmSystems

This engine integrates with the incident management system to provide automated root cause analysis for security incidents. It can be triggered automatically when high-severity incidents are detected or manually via the API.
