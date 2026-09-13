"use client";
import * as React from "react";

interface TabsContextValue { value?: string; setValue: (value: string) => void; id: string; }
const TabsContext = React.createContext<TabsContextValue>({ setValue: () => {}, id: "tabs" });
interface TabsProps extends React.HTMLAttributes<HTMLDivElement> { value?: string; defaultValue?: string; onValueChange?: (value: string) => void; }
interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { value: string; }
interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> { value: string; }

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(({ className = "", value, defaultValue, onValueChange, children, ...props }, ref) => {
  const id = React.useId();
  const [internal, setInternal] = React.useState(defaultValue);
  const setValue = (next: string) => { if (value === undefined) setInternal(next); onValueChange?.(next); };
  return <TabsContext.Provider value={{ value: value ?? internal, setValue, id }}><div ref={ref} className={`flex flex-col ${className}`} {...props}>{children}</div></TabsContext.Provider>;
});
Tabs.displayName = "Tabs";
const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className = "", onKeyDown, ...props }, ref) => (
  <div ref={ref} role="tablist" className={`ui-tabs-list ${className}`} {...props} onKeyDown={(event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'));
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click();
  }} />
));
TabsList.displayName = "TabsList";
const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(({ className = "", value, onClick, ...props }, ref) => {
  const context = React.useContext(TabsContext);
  const active = context.value === value;
  return <button ref={ref} type="button" role="tab" id={`${context.id}-tab-${value}`} aria-controls={`${context.id}-panel-${value}`} aria-selected={active} tabIndex={active || context.value === undefined ? 0 : -1} className={`ui-tab ${className}`} {...props} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) context.setValue(value); }} />;
});
TabsTrigger.displayName = "TabsTrigger";
const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(({ className = "", value, ...props }, ref) => {
  const context = React.useContext(TabsContext);
  if (context.value !== value) return null;
  return <div ref={ref} role="tabpanel" id={`${context.id}-panel-${value}`} aria-labelledby={`${context.id}-tab-${value}`} tabIndex={0} className={className} {...props} />;
});
TabsContent.displayName = "TabsContent";
export { Tabs, TabsList, TabsTrigger, TabsContent };
