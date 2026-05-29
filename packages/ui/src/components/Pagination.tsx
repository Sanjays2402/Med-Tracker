import * as React from 'react';
import { cn } from '../cn';

/** Pagination controls. */
export interface PaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Pagination = React.forwardRef<HTMLDivElement, PaginationProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Pagination"
      data-variant={variant}
      className={cn('mt-pagination', className)}
      {...rest}
    >
      {label != null && <span className="mt-pagination__label">{label}</span>}
      {children}
    </div>
  ),
);
Pagination.displayName = 'Pagination';
