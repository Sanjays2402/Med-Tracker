import * as React from 'react';
import { cn } from '../cn';

/** Native select wrapper. */
export interface SelectProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Select"
      data-variant={variant}
      className={cn('mt-select', className)}
      {...rest}
    >
      {label != null && <span className="mt-select__label">{label}</span>}
      {children}
    </div>
  ),
);
Select.displayName = 'Select';
