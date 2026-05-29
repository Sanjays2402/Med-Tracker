import * as React from 'react';
import { cn } from '../cn';

/** Line chart for trends. */
export interface TrendChartProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const TrendChart = React.forwardRef<HTMLDivElement, TrendChartProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="TrendChart"
      data-variant={variant}
      className={cn('mt-trendchart', className)}
      {...rest}
    >
      {label != null && <span className="mt-trendchart__label">{label}</span>}
      {children}
    </div>
  ),
);
TrendChart.displayName = 'TrendChart';
