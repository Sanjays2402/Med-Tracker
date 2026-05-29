import * as React from 'react';
import { cn } from '../cn';

/** Header row inside a Card. */
export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="CardHeader"
      data-variant={variant}
      className={cn('mt-cardheader', className)}
      {...rest}
    >
      {label != null && <span className="mt-cardheader__label">{label}</span>}
      {children}
    </div>
  ),
);
CardHeader.displayName = 'CardHeader';
