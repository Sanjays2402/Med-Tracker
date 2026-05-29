import * as React from 'react';
import { cn } from '../cn';

/** Form control label. */
export interface LabelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Label = React.forwardRef<HTMLDivElement, LabelProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Label"
      data-variant={variant}
      className={cn('mt-label', className)}
      {...rest}
    >
      {label != null && <span className="mt-label__label">{label}</span>}
      {children}
    </div>
  ),
);
Label.displayName = 'Label';
