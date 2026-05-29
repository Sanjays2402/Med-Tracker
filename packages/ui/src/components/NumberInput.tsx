import * as React from 'react';
import { cn } from '../cn';

/** Numeric stepper. */
export interface NumberInputProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const NumberInput = React.forwardRef<HTMLDivElement, NumberInputProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="NumberInput"
      data-variant={variant}
      className={cn('mt-numberinput', className)}
      {...rest}
    >
      {label != null && <span className="mt-numberinput__label">{label}</span>}
      {children}
    </div>
  ),
);
NumberInput.displayName = 'NumberInput';
