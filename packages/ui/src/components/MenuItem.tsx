import * as React from 'react';
import { cn } from '../cn';

/** Menu entry. */
export interface MenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const MenuItem = React.forwardRef<HTMLDivElement, MenuItemProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="MenuItem"
      data-variant={variant}
      className={cn('mt-menuitem', className)}
      {...rest}
    >
      {label != null && <span className="mt-menuitem__label">{label}</span>}
      {children}
    </div>
  ),
);
MenuItem.displayName = 'MenuItem';
