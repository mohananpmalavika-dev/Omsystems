## Security Commander UI Components

Comprehensive React/TypeScript UI for the AI Security Commander system. Provides natural language query interface, investigation visualization, evidence management, and action tracking.

---

## Architecture

### Component Hierarchy

```
SecurityCommanderApp (Main App)
├── CommanderProvider (State Management)
├── CommanderChat (Natural Language Interface)
│   └── Message bubbles with investigation summaries
├── InvestigationViewer (Investigation Display)
│   ├── IncidentCard[] (Incident list with expandable details)
│   ├── TimelineView (Chronological event visualization)
│   ├── EvidenceGallery (Video/image evidence viewer)
│   └── ActionChecklist (Recommended actions tracker)
└── Notifications (Toast notifications)
```

### State Management

**CommanderContext** provides global state using React Context + useReducer pattern:

- Message history with user queries and AI responses
- Active investigation with full details
- Investigation history
- UI view state (expanded sections, selected items)
- Notifications queue
- Connection status

---

## Components

### 1. SecurityCommanderApp

Main application component with header, navigation, and view switching.

**Usage:**
```tsx
import { SecurityCommanderApp } from './security-commander/ui';

function App() {
  return (
    <SecurityCommanderApp 
      initialQuery="Show abnormal events from last hour"
    />
  );
}
```

**Features:**
- App header with status indicators (connection, AI availability)
- Tab navigation between Chat and Investigation views
- Toast notification system
- Responsive layout

---

### 2. CommanderChat

Natural language query interface with message history.

**Usage:**
```tsx
import { CommanderChat } from './security-commander/ui';

<CommanderChat
  initialQuery="What happened at camera lobby_main?"
  onInvestigationCreated={(investigation) => {
    console.log('Investigation created:', investigation.id);
  }}
/>
```

**Features:**
- Text input for natural language queries
- Message bubbles (user, assistant, system, error types)
- Loading indicators during query processing
- Investigation summaries inline with messages
- Auto-scroll to latest message
- Suggested queries for new users

**Example Queries:**
- "Show me abnormal events from the last 30 minutes"
- "What happened at camera lobby_main this morning?"
- "Investigate unauthorized access events"
- "Show fire safety incidents from yesterday"

---

### 3. InvestigationViewer

Comprehensive investigation display with tabbed sections.

**Usage:**
```tsx
import { InvestigationViewer } from './security-commander/ui';

<InvestigationViewer
  investigationId="inv_2024_001"
  onClose={() => setView('chat')}
/>
```

**Features:**
- Investigation header with title, severity, metadata
- AI-generated summary display
- Tabbed sections: Incidents, Timeline, Evidence, Actions
- Incident expansion/collapse
- Interactive timeline with event selection
- Evidence gallery with integrity verification
- Action checklist with status tracking

**Data Display:**
- Investigation ID, title, creation time
- Severity level with color coding
- Incident count, event count, evidence count
- Time range coverage
- Asset involvement

---

### 4. IncidentCard

Display security incident with expandable details.

**Usage:**
```tsx
import { IncidentCard } from './security-commander/ui';

<IncidentCard
  incident={incident}
  expanded={isExpanded}
  onToggle={() => setExpanded(!isExpanded)}
  onInvestigate={() => investigateFurther(incident.id)}
/>
```

**Features:**
- Color-coded severity indicator (left border)
- Title, type, description
- Severity and confidence badges
- Timestamp and event count
- **Expanded view shows:**
  - Affected assets list
  - Root cause analysis
  - Contributing factors
  - Correlation fingerprint
  - Event list (first 5 + count)
  - Action buttons (Investigate, Execute Playbook)

---

### 5. TimelineView

Visual chronological display of events and incidents.

**Usage:**
```tsx
import { TimelineView } from './security-commander/ui';

<TimelineView
  events={events}
  incidents={incidents}
  onEventSelect={(event) => console.log('Selected:', event)}
  onIncidentSelect={(incident) => console.log('Selected:', incident)}
  filter={{
    eventTypes: ['unauthorized_access', 'motion_detected'],
    severityMin: 70,
    searchText: 'camera',
  }}
/>
```

**Features:**
- Grouped by date (day headers)
- Vertical timeline with dots indicating severity
- Event and incident cards side-by-side
- Color-coded severity indicators
- Click to select and view details
- Filter support:
  - Event types
  - Minimum severity
  - Text search
  - Time range
- Empty state with helpful message

---

### 6. EvidenceGallery

Video and image evidence viewer with metadata.

**Usage:**
```tsx
import { EvidenceGallery } from './security-commander/ui';

<EvidenceGallery
  evidence={evidenceList}
  onEvidenceSelect={(evidence) => console.log('Viewing:', evidence.id)}
/>
```

**Features:**
- **Main viewer:**
  - Video playback with controls
  - Image display
  - Navigation arrows (previous/next)
  - Metadata toggle overlay
- **Metadata display:**
  - Evidence ID, type, source asset
  - Timestamp, duration, file size
  - SHA256 hash for integrity
  - Verify integrity button
- **Thumbnail strip:**
  - All evidence items with preview
  - Current selection indicator
  - Item counter (X of Y)

---

### 7. ActionChecklist

Recommended actions tracker with status management.

**Usage:**
```tsx
import { ActionChecklist } from './security-commander/ui';

<ActionChecklist
  actions={recommendedActions}
  onActionUpdate={(actionId, state) => {
    console.log('Action updated:', actionId, state);
    // Save to backend
  }}
/>
```

**Features:**
- Progress bar showing completion percentage
- Priority-sorted action list (critical → high → medium → low)
- **Per-action display:**
  - Status icon (pending, in_progress, completed, failed)
  - Title, category, priority badge
  - Description
  - Notes section
  - Status-specific action buttons:
    - Pending: "Start" button
    - In Progress: "Complete" / "Mark Failed" buttons
    - Completed/Failed: "Reset" button
  - "Add Notes" button for all states

**Action Categories:**
- Investigation, Containment, Notification, Remediation, Documentation

**Priority Levels:**
- Critical (red), High (orange), Medium (yellow), Low (gray)

---

## Hooks

### useCommander()

Access commander context state and actions.

```tsx
import { useCommander } from './security-commander/ui';

function MyComponent() {
  const {
    state,                      // Current state
    addMessage,                 // Add chat message
    updateMessage,              // Update existing message
    setActiveInvestigation,     // Set active investigation
    clearActiveInvestigation,   // Clear active investigation
    addNotification,            // Show notification
    removeNotification,         // Dismiss notification
    updateViewState,            // Update UI view state
    toggleSection,              // Toggle section expansion
    clearMessages,              // Clear chat history
  } = useCommander();

  return <div>{state.messages.length} messages</div>;
}
```

### useCommanderApi()

HTTP client for Security Commander API.

```tsx
import { useCommanderApi } from './security-commander/ui';

function MyComponent() {
  const { executeQuery, getInvestigation, listInvestigations, checkHealth, loading, error } = useCommanderApi();

  const handleQuery = async () => {
    const result = await executeQuery("Show abnormal events");
    if (result.data) {
      console.log('Investigation:', result.data.investigation);
    }
  };

  return <button onClick={handleQuery}>Execute</button>;
}
```

**API Methods:**
- `executeQuery(query: string)` - Execute natural language query
- `getInvestigation(id: string)` - Get investigation by ID
- `listInvestigations(limit?: number)` - List recent investigations
- `checkHealth()` - Check system health (DB, LLM)

---

## Utilities

### Formatters

```tsx
import { formatters } from './security-commander/ui';

// Time formatting
formatters.formatTimestamp(new Date());        // "Jan 15, 10:30:45 AM"
formatters.formatRelativeTime(new Date());     // "5m ago"
formatters.formatDuration(125);                // "2m 5s"

// Severity formatting
formatters.getSeverityColor(95);               // "#dc2626" (red)
formatters.getSeverityLabel(95);               // "critical"
formatters.formatSeverityBadge(95);            // "CRITICAL (95)"

// Confidence formatting
formatters.getConfidenceColor(85);             // "#16a34a" (green)
formatters.getConfidenceLabel(85);             // "high"
formatters.formatConfidence(85);               // "85%"

// Display formatting
formatters.formatEventType("camera_offline");  // "Camera Offline"
formatters.formatAssetId("camera_123");        // "Camera 123"
formatters.formatFileSize(1048576);            // "1.0 MB"
formatters.formatLocation({ zone: "Lobby" });  // "Lobby"
formatters.truncateText("Long text...", 20);   // "Long text..."
```

---

## Styling

### CSS Framework

Components use **Tailwind CSS** utility classes. No external CSS files required.

### Color Scheme

**Severity Colors:**
- Critical (90+): Red (#dc2626)
- High (70-89): Orange (#ea580c)
- Medium (50-69): Amber (#f59e0b)
- Low (<50): Blue (#3b82f6)

**Confidence Colors:**
- Very High (90+): Green (#16a34a)
- High (70-89): Lime (#65a30d)
- Medium (50-69): Amber (#f59e0b)
- Low (<50): Red (#ef4444)

**UI Colors:**
- Primary: Blue (#2563eb)
- Background: Gray-50 (#f9fafb)
- Border: Gray-200 (#e5e7eb)
- Text: Gray-900 (#111827)

### Dark Mode

Evidence gallery uses dark theme (gray-900 background) for better video viewing.

---

## Configuration

### Environment Variables

```env
# API endpoint (default: http://localhost:3000/api/security-commander)
REACT_APP_COMMANDER_API_URL=http://localhost:3000/api/security-commander
```

### API Client Configuration

Edit `ui/hooks/useCommanderApi.ts`:

```tsx
const API_BASE_URL = process.env.REACT_APP_COMMANDER_API_URL || 'http://localhost:3000/api/security-commander';
```

---

## Integration Examples

### Example 1: Standalone Chat Widget

```tsx
import { CommanderProvider, CommanderChat } from './security-commander/ui';

function ChatWidget() {
  return (
    <CommanderProvider>
      <div className="w-96 h-[600px] border rounded-lg shadow-lg">
        <CommanderChat />
      </div>
    </CommanderProvider>
  );
}
```

### Example 2: Embedded Investigation Viewer

```tsx
import { CommanderProvider, InvestigationViewer } from './security-commander/ui';

function Dashboard() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <CommanderProvider>
      <div className="grid grid-cols-2 gap-4">
        <InvestigationList onSelect={setSelectedId} />
        {selectedId && (
          <InvestigationViewer 
            investigationId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </CommanderProvider>
  );
}
```

### Example 3: Custom Timeline Filter

```tsx
import { TimelineView } from './security-commander/ui';
import { useState } from 'react';

function FilteredTimeline({ events }) {
  const [filter, setFilter] = useState({
    severityMin: 50,
    eventTypes: ['unauthorized_access', 'motion_detected'],
  });

  return (
    <div>
      <FilterControls onChange={setFilter} />
      <TimelineView
        events={events}
        filter={filter}
        onEventSelect={(e) => console.log('Selected:', e)}
      />
    </div>
  );
}
```

---

## Development

### Prerequisites

```bash
npm install react react-dom
npm install -D @types/react @types/react-dom
npm install -D tailwindcss postcss autoprefixer
```

### Build

```bash
# Development
npm run dev

# Production build
npm run build

# Type checking
npx tsc --noEmit
```

### Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm test -- --coverage

# E2E tests
npm run test:e2e
```

---

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari 14+, Chrome Android 90+)

**Required features:**
- ES2020 support
- CSS Grid and Flexbox
- Video playback (H.264, VP9)
- LocalStorage API

---

## Performance

**Optimization techniques:**
- React.memo for expensive components
- Virtual scrolling for long event lists (future enhancement)
- Lazy loading for evidence media
- Debounced search inputs
- Incremental timeline rendering

**Bundle size (estimated):**
- Core UI: ~45KB (gzipped)
- With dependencies: ~180KB (gzipped)

---

## Accessibility

**WCAG 2.1 Level AA compliance:**
- Semantic HTML elements
- ARIA labels and roles
- Keyboard navigation support
- Focus management
- Color contrast ratios >4.5:1
- Screen reader announcements

**Keyboard shortcuts:**
- `Tab`: Navigate between elements
- `Enter/Space`: Activate buttons
- `Esc`: Close modals/investigations
- `Arrow keys`: Navigate timeline/evidence

---

## Security

**Client-side security measures:**
- XSS prevention (React's built-in escaping)
- No eval() or innerHTML usage
- Content Security Policy headers required
- Evidence integrity verification (SHA256)
- HTTPS enforcement in production

**Best practices:**
- Validate all API responses with Zod schemas
- Sanitize user input before display
- Secure cookie settings for auth tokens
- Rate limiting on API calls

---

## Troubleshooting

### Common Issues

**1. "useCommander must be used within CommanderProvider"**
- Ensure components are wrapped in `<CommanderProvider>`

**2. API calls fail with CORS errors**
- Configure backend CORS headers
- Check API_BASE_URL environment variable

**3. Video evidence won't play**
- Verify video codec support (H.264/VP9)
- Check network access to video files
- Ensure proper MIME types set on server

**4. Slow timeline rendering**
- Reduce event count with filters
- Enable virtual scrolling (future enhancement)
- Check React DevTools for re-renders

---

## Future Enhancements

**Planned features:**
- Real-time event streaming (WebSocket)
- Virtual scrolling for large datasets
- Export investigations to PDF
- Keyboard shortcuts system
- Dark mode for all components
- Mobile-optimized layouts
- Offline support with service workers
- Investigation comparison view
- Custom dashboard builder

---

## License

Part of the OmSystems AI Security Commander system.
