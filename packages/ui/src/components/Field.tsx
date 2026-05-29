import * as React from 'react';
import { cn } from '../cn';

/** Wraps label, input, and help text. */
export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Field"
      data-variant={variant}
      className={cn('mt-field', className)}
      {...rest}
    >
      {label != null && <span className="mt-field__label">{label}</span>}
      {children}
    </div>
  ),
);
Field.displayName = 'Field';
