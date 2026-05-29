import * as React from 'react';
import { cn } from '../cn';

/** Horizontal or vertical separator. */
export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Divider = React.forwardRef<HTMLDivElement, DividerProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Divider"
      data-variant={variant}
      className={cn('mt-divider', className)}
      {...rest}
    >
      {label != null && <span className="mt-divider__label">{label}</span>}
      {children}
    </div>
  ),
);
Divider.displayName = 'Divider';
