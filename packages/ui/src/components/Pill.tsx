import * as React from 'react';
import { cn } from '../cn';

/** Pill shaped indicator. Doubles as a medication card. */
export interface PillProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Pill = React.forwardRef<HTMLDivElement, PillProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Pill"
      data-variant={variant}
      className={cn('mt-pill', className)}
      {...rest}
    >
      {label != null && <span className="mt-pill__label">{label}</span>}
      {children}
    </div>
  ),
);
Pill.displayName = 'Pill';
