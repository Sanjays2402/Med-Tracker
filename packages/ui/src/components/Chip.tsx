import * as React from 'react';
import { cn } from '../cn';

/** Compact label chip. */
export interface ChipProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Chip = React.forwardRef<HTMLDivElement, ChipProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Chip"
      data-variant={variant}
      className={cn('mt-chip', className)}
      {...rest}
    >
      {label != null && <span className="mt-chip__label">{label}</span>}
      {children}
    </div>
  ),
);
Chip.displayName = 'Chip';
