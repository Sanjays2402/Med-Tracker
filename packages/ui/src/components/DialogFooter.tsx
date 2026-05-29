import * as React from 'react';
import { cn } from '../cn';

/** Modal footer. */
export interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const DialogFooter = React.forwardRef<HTMLDivElement, DialogFooterProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="DialogFooter"
      data-variant={variant}
      className={cn('mt-dialogfooter', className)}
      {...rest}
    >
      {label != null && <span className="mt-dialogfooter__label">{label}</span>}
      {children}
    </div>
  ),
);
DialogFooter.displayName = 'DialogFooter';
