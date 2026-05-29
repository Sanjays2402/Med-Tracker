import * as React from 'react';
import { cn } from '../cn';

/** CSS grid wrapper. */
export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Grid"
      data-variant={variant}
      className={cn('mt-grid', className)}
      {...rest}
    >
      {label != null && <span className="mt-grid__label">{label}</span>}
      {children}
    </div>
  ),
);
Grid.displayName = 'Grid';
