import * as React from 'react';
import { cn } from '../cn';

/** Vertical app navigation. */
export interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Sidebar"
      data-variant={variant}
      className={cn('mt-sidebar', className)}
      {...rest}
    >
      {label != null && <span className="mt-sidebar__label">{label}</span>}
      {children}
    </div>
  ),
);
Sidebar.displayName = 'Sidebar';
