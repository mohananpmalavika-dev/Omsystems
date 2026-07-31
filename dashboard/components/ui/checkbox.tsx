import * as React from "react";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className = "", ...props }, ref) => {
  return (
    <input
      type="checkbox"
      ref={ref}
      className={`h-4 w-4 rounded border border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-200 ${className}`.trim()}
      {...props}
    />
  );
});

Checkbox.displayName = "Checkbox";

export { Checkbox };
