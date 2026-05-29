import * as React from 'react';
import { cn } from '../cn';

/** Inline anchor with consistent focus styles. */
export interface LinkProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Link = React.forwardRef<HTMLDivElement, LinkProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Link"
      data-variant={variant}
      className={cn('mt-link', className)}
      {...rest}
    >
      {label != null && <span className="mt-link__label">{label}</span>}
      {children}
    </div>
  ),
);
Link.displayName = 'Link';
