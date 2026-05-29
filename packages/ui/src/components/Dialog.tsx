import * as React from 'react';
import { cn } from '../cn';

/** Modal dialog. */
export interface DialogProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Dialog"
      data-variant={variant}
      className={cn('mt-dialog', className)}
      {...rest}
    >
      {label != null && <span className="mt-dialog__label">{label}</span>}
      {children}
    </div>
  ),
);
Dialog.displayName = 'Dialog';
