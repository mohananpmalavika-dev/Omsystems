import * as React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className = '', ...props }, ref) => (
  <textarea
    ref={ref}
    className={`ui-field min-h-[100px] w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${className}`.trim()}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
