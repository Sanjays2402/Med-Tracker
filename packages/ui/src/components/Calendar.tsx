import * as React from 'react';
import { cn } from '../cn';

/** Month grid calendar. */
export interface CalendarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Calendar"
      data-variant={variant}
      className={cn('mt-calendar', className)}
      {...rest}
    >
      {label != null && <span className="mt-calendar__label">{label}</span>}
      {children}
    </div>
  ),
);
Calendar.displayName = 'Calendar';
