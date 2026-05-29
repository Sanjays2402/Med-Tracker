import * as React from 'react';
import { cn } from '../cn';

/** Tiny inline sparkline. */
export interface SparklineProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Sparkline = React.forwardRef<HTMLDivElement, SparklineProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Sparkline"
      data-variant={variant}
      className={cn('mt-sparkline', className)}
      {...rest}
    >
      {label != null && <span className="mt-sparkline__label">{label}</span>}
      {children}
    </div>
  ),
);
Sparkline.displayName = 'Sparkline';
