export default function Loading() {
  return (
    <div className="workspace-loading" role="status" aria-live="polite" aria-label="Loading workspace">
      <div className="loading-line loading-title" />
      <div className="loading-line loading-description" />
      <div className="loading-cards">{[0, 1, 2, 3].map((key) => <div key={key} className="loading-card" />)}</div>
      <div className="loading-panel" />
      <span className="sr-only">Loading workspace. Please wait.</span>
    </div>
  );
}
