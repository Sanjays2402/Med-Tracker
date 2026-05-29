import * as React from 'react';
import { cn } from '../cn';

/** Light, dark, and system theme switch. */
export interface ThemeToggleProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const ThemeToggle = React.forwardRef<HTMLDivElement, ThemeToggleProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="ThemeToggle"
      data-variant={variant}
      className={cn('mt-themetoggle', className)}
      {...rest}
    >
      {label != null && <span className="mt-themetoggle__label">{label}</span>}
      {children}
    </div>
  ),
);
ThemeToggle.displayName = 'ThemeToggle';
