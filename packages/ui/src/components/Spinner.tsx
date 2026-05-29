import * as React from 'react';
import { cn } from '../cn';

/** Loading spinner. */
export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Spinner"
      data-variant={variant}
      className={cn('mt-spinner', className)}
      {...rest}
    >
      {label != null && <span className="mt-spinner__label">{label}</span>}
      {children}
    </div>
  ),
);
Spinner.displayName = 'Spinner';
