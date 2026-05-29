import * as React from 'react';
import { cn } from '../cn';

/** Timeline of upcoming doses. */
export interface DoseTimelineProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const DoseTimeline = React.forwardRef<HTMLDivElement, DoseTimelineProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="DoseTimeline"
      data-variant={variant}
      className={cn('mt-dosetimeline', className)}
      {...rest}
    >
      {label != null && <span className="mt-dosetimeline__label">{label}</span>}
      {children}
    </div>
  ),
);
DoseTimeline.displayName = 'DoseTimeline';
