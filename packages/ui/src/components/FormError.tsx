import * as React from 'react';
import { cn } from '../cn';

/** Error message under a field. */
export interface FormErrorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const FormError = React.forwardRef<HTMLDivElement, FormErrorProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="FormError"
      data-variant={variant}
      className={cn('mt-formerror', className)}
      {...rest}
    >
      {label != null && <span className="mt-formerror__label">{label}</span>}
      {children}
    </div>
  ),
);
FormError.displayName = 'FormError';
