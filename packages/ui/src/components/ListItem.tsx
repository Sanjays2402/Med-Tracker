import * as React from 'react';
import { cn } from '../cn';

/** List item. */
export interface ListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const ListItem = React.forwardRef<HTMLDivElement, ListItemProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="ListItem"
      data-variant={variant}
      className={cn('mt-listitem', className)}
      {...rest}
    >
      {label != null && <span className="mt-listitem__label">{label}</span>}
      {children}
    </div>
  ),
);
ListItem.displayName = 'ListItem';
