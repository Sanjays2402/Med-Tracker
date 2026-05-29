import * as React from 'react';
import { cn } from '../cn';

/** Click target with primary, secondary, ghost, and danger variants. */
export interface ButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLDivElement, ButtonProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Button"
      data-variant={variant}
      className={cn('mt-button', className)}
      {...rest}
    >
      {label != null && <span className="mt-button__label">{label}</span>}
      {children}
    </div>
  ),
);
Button.displayName = 'Button';
