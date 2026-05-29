import * as React from 'react';
import { cn } from '../cn';

/** Table cell. */
export interface TableCellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const TableCell = React.forwardRef<HTMLDivElement, TableCellProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="TableCell"
      data-variant={variant}
      className={cn('mt-tablecell', className)}
      {...rest}
    >
      {label != null && <span className="mt-tablecell__label">{label}</span>}
      {children}
    </div>
  ),
);
TableCell.displayName = 'TableCell';
