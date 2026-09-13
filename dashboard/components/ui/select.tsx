"use client";
import * as React from "react";

interface SelectProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue"> { value?: string; defaultValue?: string; onValueChange?: (value: string) => void; disabled?: boolean; }
interface SelectItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { value: string; }
interface SelectValueProps extends React.HTMLAttributes<HTMLSpanElement> { placeholder?: string; }
interface SelectContextValue { value?: string; open: boolean; disabled?: boolean; setOpen: (open: boolean) => void; choose: (value: string) => void; labels: Map<string, React.ReactNode>; id: string; trigger: React.RefObject<HTMLButtonElement | null>; }
const SelectContext = React.createContext<SelectContextValue | null>(null);
function useSelect() { const context = React.useContext(SelectContext); if (!context) throw new Error("Select components must be inside Select"); return context; }
function itemLabels(children: React.ReactNode, labels = new Map<string, React.ReactNode>()) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: string; children?: React.ReactNode }>(child)) return;
    if (child.type === SelectItem && child.props.value !== undefined) labels.set(child.props.value, child.props.children);
    else if (child.props.children) itemLabels(child.props.children, labels);
  });
  return labels;
}
const Select = React.forwardRef<HTMLDivElement, SelectProps>(({ className = "", value, defaultValue, onValueChange, disabled, children, ...props }, ref) => {
  const [internal, setInternal] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const id = React.useId();
  React.useImperativeHandle(ref, () => root.current!);
  React.useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const choose = (next: string) => { if (value === undefined) setInternal(next); onValueChange?.(next); setOpen(false); trigger.current?.focus(); };
  return <SelectContext.Provider value={{ value: value ?? internal, open, disabled, setOpen, choose, labels: itemLabels(children), id, trigger }}><div ref={root} className={`ui-select ${className}`} {...props} onBlur={(event) => { props.onBlur?.(event); if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>{children}</div></SelectContext.Provider>;
});
Select.displayName = "Select";
const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ className = "", onClick, onKeyDown, ...props }, ref) => {
  const context = useSelect();
  React.useImperativeHandle(ref, () => context.trigger.current!);
  return <button ref={context.trigger} type="button" id={`${context.id}-trigger`} aria-haspopup="listbox" aria-expanded={context.open} aria-controls={context.open ? `${context.id}-listbox` : undefined} disabled={context.disabled} className={`ui-select-trigger ${className}`} {...props} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) context.setOpen(!context.open); }} onKeyDown={(event) => { onKeyDown?.(event); if (!event.defaultPrevented && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); context.setOpen(true); } }} />;
});
SelectTrigger.displayName = "SelectTrigger";
const SelectValue = React.forwardRef<HTMLSpanElement, SelectValueProps>(({ placeholder, children, ...props }, ref) => { const context = useSelect(); return <span ref={ref} {...props}>{children ?? context.labels.get(context.value ?? "") ?? context.value ?? placeholder}</span>; });
SelectValue.displayName = "SelectValue";
const SelectContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className = "", onKeyDown, ...props }, ref) => {
  const context = useSelect();
  const list = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => list.current!);
  React.useEffect(() => { if (context.open) (list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not([disabled])') || list.current?.querySelector<HTMLButtonElement>('[role="option"]:not([disabled])'))?.focus(); }, [context.open]);
  if (!context.open) return null;
  return <div ref={list} id={`${context.id}-listbox`} role="listbox" aria-labelledby={`${context.id}-trigger`} className={`ui-select-content ${className}`} {...props} onKeyDown={(event) => {
    onKeyDown?.(event); if (event.defaultPrevented) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); context.setOpen(false); context.trigger.current?.focus(); return; }
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not([disabled])'));
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      event.preventDefault(); options[next]?.focus();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== " ") {
      const ordered = [...options.slice(index + 1), ...options.slice(0, index + 1)];
      ordered.find((option) => option.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()))?.focus();
    }
  }} />;
});
SelectContent.displayName = "SelectContent";
const SelectItem = React.forwardRef<HTMLButtonElement, SelectItemProps>(({ className = "", value, onClick, ...props }, ref) => {
  const context = useSelect();
  return <button ref={ref} type="button" role="option" aria-selected={context.value === value} tabIndex={-1} className={`ui-select-item ${className}`} data-value={value} {...props} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) context.choose(value); }} />;
});
SelectItem.displayName = "SelectItem";
export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
