import * as React from 'react';
import { cn } from '../cn';

/** Row of Stat tiles. */
export interface StatGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const StatGroup = React.forwardRef<HTMLDivElement, StatGroupProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="StatGroup"
      data-variant={variant}
      className={cn('mt-statgroup', className)}
      {...rest}
    >
      {label != null && <span className="mt-statgroup__label">{label}</span>}
      {children}
    </div>
  ),
);
StatGroup.displayName = 'StatGroup';
