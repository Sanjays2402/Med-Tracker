import * as React from 'react';
import { cn } from '../cn';

/** Tabbed interface. */
export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Tabs"
      data-variant={variant}
      className={cn('mt-tabs', className)}
      {...rest}
    >
      {label != null && <span className="mt-tabs__label">{label}</span>}
      {children}
    </div>
  ),
);
Tabs.displayName = 'Tabs';
