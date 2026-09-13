import * as React from 'react';

export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`ui-card rounded-xl border ${className}`.trim()}
      {...props}
    />
  );
}

export function CardHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`ui-card-header px-5 py-4 border-b ${className}`.trim()} {...props} />
  );
}

export function CardTitle({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`text-sm font-semibold ${className}`.trim()} {...props} />;
}

export function CardDescription({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-muted text-sm leading-relaxed ${className}`.trim()} {...props} />;
}

export function CardContent({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-5 ${className}`.trim()} {...props} />;
}
