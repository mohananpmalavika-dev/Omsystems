import * as React from "react";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className = "", onCheckedChange, onChange, checked, ...props }, ref) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(event);
    onCheckedChange?.(event.target.checked);
  };

  return (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      onChange={handleChange}
      className={`h-4 w-4 rounded border border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-200 ${className}`.trim()}
      {...props}
    />
  );
});

Checkbox.displayName = "Checkbox";

export { Checkbox };
