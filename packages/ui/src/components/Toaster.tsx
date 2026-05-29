import * as React from 'react';
import { cn } from '../cn';

/** Toast viewport. */
export interface ToasterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Toaster = React.forwardRef<HTMLDivElement, ToasterProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Toaster"
      data-variant={variant}
      className={cn('mt-toaster', className)}
      {...rest}
    >
      {label != null && <span className="mt-toaster__label">{label}</span>}
      {children}
    </div>
  ),
);
Toaster.displayName = 'Toaster';
