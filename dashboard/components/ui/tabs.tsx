import * as React from 'react';

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}
interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value?: string;
}
interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(({ className = '', ...props }, ref) => (
  <div ref={ref} className={`flex flex-col ${className}`.trim()} {...props} />
));
Tabs.displayName = 'Tabs';

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(({ className = '', ...props }, ref) => (
  <div ref={ref} className={`flex items-center gap-2 rounded-full bg-slate-100 p-1 ${className}`.trim()} {...props} />
));
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(({ className = '', value, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${className}`.trim()}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(({ className = '', ...props }, ref) => (
  <div ref={ref} className={className} {...props} />
));
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
