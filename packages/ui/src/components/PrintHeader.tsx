import * as React from 'react';
import { cn } from '../cn';

/** Header used on printable reports. */
export interface PrintHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const PrintHeader = React.forwardRef<HTMLDivElement, PrintHeaderProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="PrintHeader"
      data-variant={variant}
      className={cn('mt-printheader', className)}
      {...rest}
    >
      {label != null && <span className="mt-printheader__label">{label}</span>}
      {children}
    </div>
  ),
);
PrintHeader.displayName = 'PrintHeader';
