import * as React from 'react';
import { cn } from '../cn';

/** Heading row with actions. */
export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="PageHeader"
      data-variant={variant}
      className={cn('mt-pageheader', className)}
      {...rest}
    >
      {label != null && <span className="mt-pageheader__label">{label}</span>}
      {children}
    </div>
  ),
);
PageHeader.displayName = 'PageHeader';
