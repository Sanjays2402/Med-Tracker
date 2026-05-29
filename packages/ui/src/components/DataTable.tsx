import * as React from 'react';
import { cn } from '../cn';

/** Sortable, paginated table. */
export interface DataTableProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const DataTable = React.forwardRef<HTMLDivElement, DataTableProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="DataTable"
      data-variant={variant}
      className={cn('mt-datatable', className)}
      {...rest}
    >
      {label != null && <span className="mt-datatable__label">{label}</span>}
      {children}
    </div>
  ),
);
DataTable.displayName = 'DataTable';
