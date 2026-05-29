import * as React from 'react';
import { cn } from '../cn';

/** Row showing one dose and its status. */
export interface DoseRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const DoseRow = React.forwardRef<HTMLDivElement, DoseRowProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="DoseRow"
      data-variant={variant}
      className={cn('mt-doserow', className)}
      {...rest}
    >
      {label != null && <span className="mt-doserow__label">{label}</span>}
      {children}
    </div>
  ),
);
DoseRow.displayName = 'DoseRow';
