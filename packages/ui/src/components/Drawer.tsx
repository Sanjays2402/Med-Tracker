import * as React from 'react';
import { cn } from '../cn';

/** Side drawer. */
export interface DrawerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Drawer = React.forwardRef<HTMLDivElement, DrawerProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Drawer"
      data-variant={variant}
      className={cn('mt-drawer', className)}
      {...rest}
    >
      {label != null && <span className="mt-drawer__label">{label}</span>}
      {children}
    </div>
  ),
);
Drawer.displayName = 'Drawer';
