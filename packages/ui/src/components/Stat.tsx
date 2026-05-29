import * as React from 'react';
import { cn } from '../cn';

/** Single metric with label and value. */
export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Stat = React.forwardRef<HTMLDivElement, StatProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Stat"
      data-variant={variant}
      className={cn('mt-stat', className)}
      {...rest}
    >
      {label != null && <span className="mt-stat__label">{label}</span>}
      {children}
    </div>
  ),
);
Stat.displayName = 'Stat';
