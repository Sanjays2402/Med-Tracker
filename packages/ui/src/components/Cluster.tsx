import * as React from 'react';
import { cn } from '../cn';

/** Wrapping inline cluster. */
export interface ClusterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Cluster = React.forwardRef<HTMLDivElement, ClusterProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Cluster"
      data-variant={variant}
      className={cn('mt-cluster', className)}
      {...rest}
    >
      {label != null && <span className="mt-cluster__label">{label}</span>}
      {children}
    </div>
  ),
);
Cluster.displayName = 'Cluster';
