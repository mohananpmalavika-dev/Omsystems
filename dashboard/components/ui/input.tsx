import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = "", type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={`ui-field flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      ref={ref}
      {...props}
    />
  );
});

Input.displayName = "Input";

export { Input };
