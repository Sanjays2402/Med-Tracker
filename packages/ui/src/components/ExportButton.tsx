import * as React from 'react';
import { cn } from '../cn';

/** Trigger CSV or PDF export. */
export interface ExportButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const ExportButton = React.forwardRef<HTMLDivElement, ExportButtonProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="ExportButton"
      data-variant={variant}
      className={cn('mt-exportbutton', className)}
      {...rest}
    >
      {label != null && <span className="mt-exportbutton__label">{label}</span>}
      {children}
    </div>
  ),
);
ExportButton.displayName = 'ExportButton';
