import * as React from 'react';
import { cn } from '../cn';

/** Modal header. */
export interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const DialogHeader = React.forwardRef<HTMLDivElement, DialogHeaderProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="DialogHeader"
      data-variant={variant}
      className={cn('mt-dialogheader', className)}
      {...rest}
    >
      {label != null && <span className="mt-dialogheader__label">{label}</span>}
      {children}
    </div>
  ),
);
DialogHeader.displayName = 'DialogHeader';
