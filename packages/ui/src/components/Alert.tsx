import * as React from 'react';
import { cn } from '../cn';

/** Inline alert with severity. */
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Alert"
      data-variant={variant}
      className={cn('mt-alert', className)}
      {...rest}
    >
      {label != null && <span className="mt-alert__label">{label}</span>}
      {children}
    </div>
  ),
);
Alert.displayName = 'Alert';
