import * as React from 'react';
import { cn } from '../cn';

/** Tri state checkbox. */
export interface CheckboxProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLDivElement, CheckboxProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Checkbox"
      data-variant={variant}
      className={cn('mt-checkbox', className)}
      {...rest}
    >
      {label != null && <span className="mt-checkbox__label">{label}</span>}
      {children}
    </div>
  ),
);
Checkbox.displayName = 'Checkbox';
