import * as React from 'react';
import { cn } from '../cn';

/** Day grid heatmap. */
export interface HeatmapProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Heatmap = React.forwardRef<HTMLDivElement, HeatmapProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Heatmap"
      data-variant={variant}
      className={cn('mt-heatmap', className)}
      {...rest}
    >
      {label != null && <span className="mt-heatmap__label">{label}</span>}
      {children}
    </div>
  ),
);
Heatmap.displayName = 'Heatmap';
