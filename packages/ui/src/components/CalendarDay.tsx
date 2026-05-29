import * as React from 'react';
import { cn } from '../cn';

/** Single day cell. */
export interface CalendarDayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const CalendarDay = React.forwardRef<HTMLDivElement, CalendarDayProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="CalendarDay"
      data-variant={variant}
      className={cn('mt-calendarday', className)}
      {...rest}
    >
      {label != null && <span className="mt-calendarday__label">{label}</span>}
      {children}
    </div>
  ),
);
CalendarDay.displayName = 'CalendarDay';
