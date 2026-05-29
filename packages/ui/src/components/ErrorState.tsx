import * as React from 'react';
import { cn } from '../cn';

/** Error illustration and retry. */
export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="ErrorState"
      data-variant={variant}
      className={cn('mt-errorstate', className)}
      {...rest}
    >
      {label != null && <span className="mt-errorstate__label">{label}</span>}
      {children}
    </div>
  ),
);
ErrorState.displayName = 'ErrorState';
