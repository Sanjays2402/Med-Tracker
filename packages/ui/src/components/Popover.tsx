import * as React from 'react';
import { cn } from '../cn';

/** Anchored popover. */
export interface PopoverProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Popover = React.forwardRef<HTMLDivElement, PopoverProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Popover"
      data-variant={variant}
      className={cn('mt-popover', className)}
      {...rest}
    >
      {label != null && <span className="mt-popover__label">{label}</span>}
      {children}
    </div>
  ),
);
Popover.displayName = 'Popover';
