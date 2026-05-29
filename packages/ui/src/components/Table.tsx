import * as React from 'react';
import { cn } from '../cn';

/** Accessible table. */
export interface TableProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Table = React.forwardRef<HTMLDivElement, TableProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Table"
      data-variant={variant}
      className={cn('mt-table', className)}
      {...rest}
    >
      {label != null && <span className="mt-table__label">{label}</span>}
      {children}
    </div>
  ),
);
Table.displayName = 'Table';
