import * as React from 'react';
import { cn } from '../cn';

/** Top navigation item. */
export interface NavItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const NavItem = React.forwardRef<HTMLDivElement, NavItemProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="NavItem"
      data-variant={variant}
      className={cn('mt-navitem', className)}
      {...rest}
    >
      {label != null && <span className="mt-navitem__label">{label}</span>}
      {children}
    </div>
  ),
);
NavItem.displayName = 'NavItem';
