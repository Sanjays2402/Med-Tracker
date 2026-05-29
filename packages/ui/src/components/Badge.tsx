import * as React from 'react';
import { cn } from '../cn';

/** Small status badge. */
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Badge"
      data-variant={variant}
      className={cn('mt-badge', className)}
      {...rest}
    >
      {label != null && <span className="mt-badge__label">{label}</span>}
      {children}
    </div>
  ),
);
Badge.displayName = 'Badge';
