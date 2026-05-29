import * as React from 'react';
import { cn } from '../cn';

/** Card showing days of supply left. */
export interface RefillCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const RefillCard = React.forwardRef<HTMLDivElement, RefillCardProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="RefillCard"
      data-variant={variant}
      className={cn('mt-refillcard', className)}
      {...rest}
    >
      {label != null && <span className="mt-refillcard__label">{label}</span>}
      {children}
    </div>
  ),
);
RefillCard.displayName = 'RefillCard';
