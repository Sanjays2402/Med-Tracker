import * as React from 'react';
import { cn } from '../cn';

/** Yes or no prompt. */
export interface ConfirmDialogProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const ConfirmDialog = React.forwardRef<HTMLDivElement, ConfirmDialogProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="ConfirmDialog"
      data-variant={variant}
      className={cn('mt-confirmdialog', className)}
      {...rest}
    >
      {label != null && <span className="mt-confirmdialog__label">{label}</span>}
      {children}
    </div>
  ),
);
ConfirmDialog.displayName = 'ConfirmDialog';
