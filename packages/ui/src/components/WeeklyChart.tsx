import * as React from 'react';
import { cn } from '../cn';

/** 7 day adherence bar chart. */
export interface WeeklyChartProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const WeeklyChart = React.forwardRef<HTMLDivElement, WeeklyChartProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="WeeklyChart"
      data-variant={variant}
      className={cn('mt-weeklychart', className)}
      {...rest}
    >
      {label != null && <span className="mt-weeklychart__label">{label}</span>}
      {children}
    </div>
  ),
);
WeeklyChart.displayName = 'WeeklyChart';
