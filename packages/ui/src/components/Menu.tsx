import * as React from 'react';
import { cn } from '../cn';

/** Dropdown menu. */
export interface MenuProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Menu = React.forwardRef<HTMLDivElement, MenuProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Menu"
      data-variant={variant}
      className={cn('mt-menu', className)}
      {...rest}
    >
      {label != null && <span className="mt-menu__label">{label}</span>}
      {children}
    </div>
  ),
);
Menu.displayName = 'Menu';
