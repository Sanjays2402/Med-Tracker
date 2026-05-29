import * as React from 'react';
import { cn } from '../cn';

/** Top navigation bar. */
export interface NavBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const NavBar = React.forwardRef<HTMLDivElement, NavBarProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="NavBar"
      data-variant={variant}
      className={cn('mt-navbar', className)}
      {...rest}
    >
      {label != null && <span className="mt-navbar__label">{label}</span>}
      {children}
    </div>
  ),
);
NavBar.displayName = 'NavBar';
