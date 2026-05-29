import * as React from 'react';
import { cn } from '../cn';

/** Empty state illustration and copy. */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="EmptyState"
      data-variant={variant}
      className={cn('mt-emptystate', className)}
      {...rest}
    >
      {label != null && <span className="mt-emptystate__label">{label}</span>}
      {children}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';
