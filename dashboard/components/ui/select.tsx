import * as React from 'react';

interface SelectProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
}

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}
interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {}
interface SelectItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}
interface SelectValueProps extends React.HTMLAttributes<HTMLSpanElement> {
  placeholder?: string;
}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(({ className = '', ...props }, ref) => (
  <div ref={ref} className={className} {...props} />
));
Select.displayName = 'Select';

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(({ className = '', ...props }, ref) => (
  <button ref={ref} type="button" className={`flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ${className}`.trim()} {...props} />
));
SelectTrigger.displayName = 'SelectTrigger';

const SelectValue = React.forwardRef<HTMLSpanElement, SelectValueProps>(({ className = '', ...props }, ref) => (
  <span ref={ref} className={className} {...props} />
));
SelectValue.displayName = 'SelectValue';

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(({ className = '', ...props }, ref) => (
  <div ref={ref} className={`rounded-md border border-slate-200 bg-white p-1 shadow-sm ${className}`.trim()} {...props} />
));
SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef<HTMLButtonElement, SelectItemProps>(({ className = '', value, ...props }, ref) => (
  <button ref={ref} type="button" className={`flex w-full items-center rounded-md px-3 py-2 text-sm hover:bg-slate-100 ${className}`.trim()} data-value={value} {...props} />
));
SelectItem.displayName = 'SelectItem';

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
