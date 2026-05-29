import * as React from 'react';
import { cn } from '../cn';

/** Success illustration. */
export interface SuccessStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const SuccessState = React.forwardRef<HTMLDivElement, SuccessStateProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="SuccessState"
      data-variant={variant}
      className={cn('mt-successstate', className)}
      {...rest}
    >
      {label != null && <span className="mt-successstate__label">{label}</span>}
      {children}
    </div>
  ),
);
SuccessState.displayName = 'SuccessState';
