import * as React from 'react';
import { cn } from '../cn';

/** Table header row. */
export interface TableHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const TableHeader = React.forwardRef<HTMLDivElement, TableHeaderProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="TableHeader"
      data-variant={variant}
      className={cn('mt-tableheader', className)}
      {...rest}
    >
      {label != null && <span className="mt-tableheader__label">{label}</span>}
      {children}
    </div>
  ),
);
TableHeader.displayName = 'TableHeader';
