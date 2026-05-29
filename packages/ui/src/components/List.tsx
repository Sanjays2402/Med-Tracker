import * as React from 'react';
import { cn } from '../cn';

/** Vertical list container. */
export interface ListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const List = React.forwardRef<HTMLDivElement, ListProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="List"
      data-variant={variant}
      className={cn('mt-list', className)}
      {...rest}
    >
      {label != null && <span className="mt-list__label">{label}</span>}
      {children}
    </div>
  ),
);
List.displayName = 'List';
