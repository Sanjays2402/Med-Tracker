import * as React from 'react';
import { cn } from '../cn';

/** Read only preview of a schedule. */
export interface SchedulePreviewProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const SchedulePreview = React.forwardRef<HTMLDivElement, SchedulePreviewProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="SchedulePreview"
      data-variant={variant}
      className={cn('mt-schedulepreview', className)}
      {...rest}
    >
      {label != null && <span className="mt-schedulepreview__label">{label}</span>}
      {children}
    </div>
  ),
);
SchedulePreview.displayName = 'SchedulePreview';
