import * as React from "react";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(({ className = "", value = 0, max = 100, ...props }, ref) => {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div ref={ref} className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className}`.trim()} {...props}>
      <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${percentage}%` }} />
    </div>
  );
});

Progress.displayName = "Progress";

export { Progress };
