import * as React from 'react';
import { cn } from '../cn';

/** Single radio control. */
export interface RadioProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Radio = React.forwardRef<HTMLDivElement, RadioProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Radio"
      data-variant={variant}
      className={cn('mt-radio', className)}
      {...rest}
    >
      {label != null && <span className="mt-radio__label">{label}</span>}
      {children}
    </div>
  ),
);
Radio.displayName = 'Radio';
