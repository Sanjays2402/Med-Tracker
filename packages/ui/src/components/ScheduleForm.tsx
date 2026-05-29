import * as React from 'react';
import { cn } from '../cn';

/** Form to define schedules. */
export interface ScheduleFormProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const ScheduleForm = React.forwardRef<HTMLDivElement, ScheduleFormProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="ScheduleForm"
      data-variant={variant}
      className={cn('mt-scheduleform', className)}
      {...rest}
    >
      {label != null && <span className="mt-scheduleform__label">{label}</span>}
      {children}
    </div>
  ),
);
ScheduleForm.displayName = 'ScheduleForm';
