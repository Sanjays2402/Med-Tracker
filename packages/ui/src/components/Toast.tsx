import * as React from 'react';
import { cn } from '../cn';

/** Transient notification. */
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Toast"
      data-variant={variant}
      className={cn('mt-toast', className)}
      {...rest}
    >
      {label != null && <span className="mt-toast__label">{label}</span>}
      {children}
    </div>
  ),
);
Toast.displayName = 'Toast';
