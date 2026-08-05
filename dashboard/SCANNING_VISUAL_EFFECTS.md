# Camera Scanning Visual Effects

## Overview
Enhanced visual feedback for camera scanning operations to keep users engaged during the discovery process.

## Visual Effects Added

### 1. **Scanning Panel Animations**
When scanning is active, the `.discovery-status-panel.scanning` displays:

- **Sweeping Light Effect**: A gradient sweep animates from left to right, simulating a scanning motion
- **Pulsing Border**: The panel border pulses with a subtle glow effect
- **Background Gradient**: Enhanced blue gradient background indicating active state

### 2. **Scan Status Pill Animations**
The `.scan-pill.active` element shows:

- **Glowing Effect**: Pulsing glow animation around the pill
- **Radar Ripple**: Expanding circular ripple effect emanating from the pill
- **Animated Dot**: A pulsing dot indicator next to "Scanning…" text
- **Shadow Effect**: Dynamic shadow that pulses with the glow

### 3. **Button Loading States**
When scan/approve buttons are disabled (during operation):

- **Spinner Animation**: A rotating spinner appears on the left side of the button
- **Reduced Opacity**: Button appears slightly dimmed to indicate disabled state
- **Smooth Transition**: All state changes animate smoothly

### 4. **Discovery Metrics Animation**
The three metric boxes (Found, Pending, Approved) animate when scanning:

- **Staggered Fade-in**: Each metric box fades in with a slight delay
- **Slide-up Effect**: Boxes slide up gently as they appear
- **Sequential Timing**: Creates a cascade effect (0s, 0.2s, 0.4s delays)

### 5. **Additional Scanning Icon** (Optional Enhancement)
A `.scanning-icon` class is available for adding to the UI:

- **Dual Ripple Effect**: Two concentric circles expanding outward
- **Pulsing Center Dot**: Central dot that pulses in sync with ripples
- **Coordinated Animation**: All elements work together for cohesive feedback

## Animation Keyframes

### Core Animations
- `scanning-sweep`: 2.5s - Light sweep across panel
- `scanning-pulse`: 2s - Border glow pulse
- `scanning-pill-glow`: 1.5s - Pill shadow glow
- `scanning-radar`: 2s - Radar ripple expansion
- `scanning-dot-pulse`: 1.2s - Dot scale pulse
- `scanning-ripple`: 2s - Icon ripple expansion
- `button-spinner`: 0.8s - Button loading spinner
- `metrics-fade-in`: 0.6s - Metric boxes entrance

### Timing & Easing
- Most animations use `ease-in-out` for smooth, natural motion
- Ripple effects use `cubic-bezier(0, 0.2, 0.8, 1)` for radar-like feel
- Staggered delays create sequential visual interest

## CSS Classes

### Main Classes
- `.discovery-status-panel.scanning` - Active scanning state
- `.scan-pill.active` - Active status indicator
- `.scanning-icon` - Optional animated icon
- `.primary-button:disabled::before` - Button spinner

### States
- `.scanning` - Indicates active scanning
- `.idle` - Indicates ready but not scanning
- `.ready` - Indicates cameras ready for provisioning

## Color Scheme
- Primary Blue: `#1966b8` (scanning elements)
- Light Blue: `#e4f0ff` (backgrounds)
- Border Blue: `#9ec7ff` (panel borders)
- Shadow Blue: `rgba(53, 111, 246, ...)` (glows and effects)

## Performance Considerations
- All animations use `transform` and `opacity` for GPU acceleration
- Pseudo-elements (::before, ::after) used to minimize DOM complexity
- Animations pause when elements are not visible
- Moderate timing (1-2.5s) prevents motion sickness

## Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- CSS animations with vendor prefixes not needed for these properties
- Graceful degradation: Static styles work if animations not supported

## Usage Examples

### Basic Scanning State
The scanning state is automatically applied when the `scanning` boolean is true in the React component.

### Adding Scanning Icon (Optional)
If you want to add a visual scanning radar icon, add this to the JSX:
```jsx
<div className="scanning-icon">
  <span></span>
</div>
```

### Customizing Timing
To adjust animation speed, modify the animation duration in CSS:
```css
.discovery-status-panel.scanning::before {
  animation-duration: 3s; /* slower sweep */
}
```

## Future Enhancements
Possible additions if more feedback is needed:
- Sound effects (optional beep on discovery)
- Vibration feedback (mobile devices)
- Progress percentage indicator
- Camera count update animations
- Toast notifications for found devices
