import * as React from 'react';
import { cn } from '../cn';

/** Menu separator. */
export interface MenuDividerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const MenuDivider = React.forwardRef<HTMLDivElement, MenuDividerProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="MenuDivider"
      data-variant={variant}
      className={cn('mt-menudivider', className)}
      {...rest}
    >
      {label != null && <span className="mt-menudivider__label">{label}</span>}
      {children}
    </div>
  ),
);
MenuDivider.displayName = 'MenuDivider';
