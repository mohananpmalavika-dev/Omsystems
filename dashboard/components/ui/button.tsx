import * as React from 'react';

type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'ui-button-primary',
  outline: 'ui-button-outline',
  secondary: 'ui-button-secondary',
  ghost: 'ui-button-ghost',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
};

export function Button({
  className = '',
  variant = 'default',
  size = 'md',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`ui-button inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()}
      {...props}
    />
  );
}
