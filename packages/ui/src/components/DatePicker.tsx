import * as React from 'react';
import { cn } from '../cn';

/** Date selection input. */
export interface DatePickerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const DatePicker = React.forwardRef<HTMLDivElement, DatePickerProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="DatePicker"
      data-variant={variant}
      className={cn('mt-datepicker', className)}
      {...rest}
    >
      {label != null && <span className="mt-datepicker__label">{label}</span>}
      {children}
    </div>
  ),
);
DatePicker.displayName = 'DatePicker';
