import * as React from 'react';
import { cn } from '../cn';

/** Confirmation dialog. */
export interface AlertDialogProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const AlertDialog = React.forwardRef<HTMLDivElement, AlertDialogProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="AlertDialog"
      data-variant={variant}
      className={cn('mt-alertdialog', className)}
      {...rest}
    >
      {label != null && <span className="mt-alertdialog__label">{label}</span>}
      {children}
    </div>
  ),
);
AlertDialog.displayName = 'AlertDialog';
