import * as React from 'react';
import { cn } from '../cn';

/** Generic styled box. */
export interface BoxProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Box = React.forwardRef<HTMLDivElement, BoxProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Box"
      data-variant={variant}
      className={cn('mt-box', className)}
      {...rest}
    >
      {label != null && <span className="mt-box__label">{label}</span>}
      {children}
    </div>
  ),
);
Box.displayName = 'Box';
