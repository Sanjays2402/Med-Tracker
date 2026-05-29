import * as React from 'react';
import { cn } from '../cn';

/** Breadcrumb trail. */
export interface BreadcrumbProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Breadcrumb = React.forwardRef<HTMLDivElement, BreadcrumbProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Breadcrumb"
      data-variant={variant}
      className={cn('mt-breadcrumb', className)}
      {...rest}
    >
      {label != null && <span className="mt-breadcrumb__label">{label}</span>}
      {children}
    </div>
  ),
);
Breadcrumb.displayName = 'Breadcrumb';
