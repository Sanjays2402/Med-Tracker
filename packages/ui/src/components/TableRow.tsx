import * as React from 'react';
import { cn } from '../cn';

/** Table row. */
export interface TableRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const TableRow = React.forwardRef<HTMLDivElement, TableRowProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="TableRow"
      data-variant={variant}
      className={cn('mt-tablerow', className)}
      {...rest}
    >
      {label != null && <span className="mt-tablerow__label">{label}</span>}
      {children}
    </div>
  ),
);
TableRow.displayName = 'TableRow';
