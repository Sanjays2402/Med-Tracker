import * as React from 'react';
import { cn } from '../cn';

/** Logical grouping for related fields. */
export interface FieldsetProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Fieldset = React.forwardRef<HTMLDivElement, FieldsetProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Fieldset"
      data-variant={variant}
      className={cn('mt-fieldset', className)}
      {...rest}
    >
      {label != null && <span className="mt-fieldset__label">{label}</span>}
      {children}
    </div>
  ),
);
Fieldset.displayName = 'Fieldset';
