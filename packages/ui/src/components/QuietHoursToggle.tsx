import * as React from 'react';
import { cn } from '../cn';

/** Toggle quiet hours behaviour. */
export interface QuietHoursToggleProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const QuietHoursToggle = React.forwardRef<HTMLDivElement, QuietHoursToggleProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="QuietHoursToggle"
      data-variant={variant}
      className={cn('mt-quiethourstoggle', className)}
      {...rest}
    >
      {label != null && <span className="mt-quiethourstoggle__label">{label}</span>}
      {children}
    </div>
  ),
);
QuietHoursToggle.displayName = 'QuietHoursToggle';
