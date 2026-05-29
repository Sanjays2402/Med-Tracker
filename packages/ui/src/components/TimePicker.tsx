import * as React from 'react';
import { cn } from '../cn';

/** Time of day picker. */
export interface TimePickerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const TimePicker = React.forwardRef<HTMLDivElement, TimePickerProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="TimePicker"
      data-variant={variant}
      className={cn('mt-timepicker', className)}
      {...rest}
    >
      {label != null && <span className="mt-timepicker__label">{label}</span>}
      {children}
    </div>
  ),
);
TimePicker.displayName = 'TimePicker';
