import * as React from 'react';
import { cn } from '../cn';

/** Calendar header row. */
export interface CalendarHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const CalendarHeader = React.forwardRef<HTMLDivElement, CalendarHeaderProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="CalendarHeader"
      data-variant={variant}
      className={cn('mt-calendarheader', className)}
      {...rest}
    >
      {label != null && <span className="mt-calendarheader__label">{label}</span>}
      {children}
    </div>
  ),
);
CalendarHeader.displayName = 'CalendarHeader';
