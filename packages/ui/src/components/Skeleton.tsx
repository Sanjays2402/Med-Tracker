import * as React from 'react';
import { cn } from '../cn';

/** Placeholder shimmer. */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Skeleton"
      data-variant={variant}
      className={cn('mt-skeleton', className)}
      {...rest}
    >
      {label != null && <span className="mt-skeleton__label">{label}</span>}
      {children}
    </div>
  ),
);
Skeleton.displayName = 'Skeleton';
