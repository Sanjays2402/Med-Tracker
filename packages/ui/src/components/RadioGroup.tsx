import * as React from 'react';
import { cn } from '../cn';

/** Grouped radios. */
export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="RadioGroup"
      data-variant={variant}
      className={cn('mt-radiogroup', className)}
      {...rest}
    >
      {label != null && <span className="mt-radiogroup__label">{label}</span>}
      {children}
    </div>
  ),
);
RadioGroup.displayName = 'RadioGroup';
