import * as React from 'react';
import { cn } from '../cn';

/** Top level layout with sidebar and main. */
export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const AppShell = React.forwardRef<HTMLDivElement, AppShellProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="AppShell"
      data-variant={variant}
      className={cn('mt-appshell', className)}
      {...rest}
    >
      {label != null && <span className="mt-appshell__label">{label}</span>}
      {children}
    </div>
  ),
);
AppShell.displayName = 'AppShell';
