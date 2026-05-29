import * as React from 'react';
import { cn } from '../cn';

/** Current streak badge. */
export interface StreakBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const StreakBadge = React.forwardRef<HTMLDivElement, StreakBadgeProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="StreakBadge"
      data-variant={variant}
      className={cn('mt-streakbadge', className)}
      {...rest}
    >
      {label != null && <span className="mt-streakbadge__label">{label}</span>}
      {children}
    </div>
  ),
);
StreakBadge.displayName = 'StreakBadge';
