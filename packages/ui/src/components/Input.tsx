import * as React from 'react';
import { cn } from '../cn';

/** Single line text input. */
export interface InputProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLDivElement, InputProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Input"
      data-variant={variant}
      className={cn('mt-input', className)}
      {...rest}
    >
      {label != null && <span className="mt-input__label">{label}</span>}
      {children}
    </div>
  ),
);
Input.displayName = 'Input';
