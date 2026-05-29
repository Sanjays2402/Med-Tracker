import * as React from 'react';
import { cn } from '../cn';

/** Inline code. */
export interface CodeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Code = React.forwardRef<HTMLDivElement, CodeProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Code"
      data-variant={variant}
      className={cn('mt-code', className)}
      {...rest}
    >
      {label != null && <span className="mt-code__label">{label}</span>}
      {children}
    </div>
  ),
);
Code.displayName = 'Code';
