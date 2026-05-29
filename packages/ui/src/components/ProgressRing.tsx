import * as React from 'react';
import { cn } from '../cn';

/** Determinate ring progress. */
export interface ProgressRingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const ProgressRing = React.forwardRef<HTMLDivElement, ProgressRingProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="ProgressRing"
      data-variant={variant}
      className={cn('mt-progressring', className)}
      {...rest}
    >
      {label != null && <span className="mt-progressring__label">{label}</span>}
      {children}
    </div>
  ),
);
ProgressRing.displayName = 'ProgressRing';
