import * as React from 'react';
import { cn } from '../cn';

/** Tab list container. */
export interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const TabList = React.forwardRef<HTMLDivElement, TabListProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="TabList"
      data-variant={variant}
      className={cn('mt-tablist', className)}
      {...rest}
    >
      {label != null && <span className="mt-tablist__label">{label}</span>}
      {children}
    </div>
  ),
);
TabList.displayName = 'TabList';
