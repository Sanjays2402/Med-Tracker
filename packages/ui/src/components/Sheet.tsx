import * as React from 'react';
import { cn } from '../cn';

/** Bottom sheet for mobile. */
export interface SheetProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Sheet = React.forwardRef<HTMLDivElement, SheetProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Sheet"
      data-variant={variant}
      className={cn('mt-sheet', className)}
      {...rest}
    >
      {label != null && <span className="mt-sheet__label">{label}</span>}
      {children}
    </div>
  ),
);
Sheet.displayName = 'Sheet';
