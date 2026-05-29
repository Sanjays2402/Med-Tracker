import * as React from 'react';
import { cn } from '../cn';

/** Single sidebar entry. */
export interface SidebarItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const SidebarItem = React.forwardRef<HTMLDivElement, SidebarItemProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="SidebarItem"
      data-variant={variant}
      className={cn('mt-sidebaritem', className)}
      {...rest}
    >
      {label != null && <span className="mt-sidebaritem__label">{label}</span>}
      {children}
    </div>
  ),
);
SidebarItem.displayName = 'SidebarItem';
