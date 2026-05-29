import * as React from 'react';
import { cn } from '../cn';

/** Single tab trigger. */
export interface TabProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Tab = React.forwardRef<HTMLDivElement, TabProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Tab"
      data-variant={variant}
      className={cn('mt-tab', className)}
      {...rest}
    >
      {label != null && <span className="mt-tab__label">{label}</span>}
      {children}
    </div>
  ),
);
Tab.displayName = 'Tab';
