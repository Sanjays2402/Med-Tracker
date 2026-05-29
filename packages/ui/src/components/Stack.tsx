import * as React from 'react';
import { cn } from '../cn';

/** Vertical flex stack. */
export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Stack"
      data-variant={variant}
      className={cn('mt-stack', className)}
      {...rest}
    >
      {label != null && <span className="mt-stack__label">{label}</span>}
      {children}
    </div>
  ),
);
Stack.displayName = 'Stack';
