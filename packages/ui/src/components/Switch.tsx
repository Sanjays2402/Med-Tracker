import * as React from 'react';
import { cn } from '../cn';

/** Two state toggle. */
export interface SwitchProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Switch = React.forwardRef<HTMLDivElement, SwitchProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Switch"
      data-variant={variant}
      className={cn('mt-switch', className)}
      {...rest}
    >
      {label != null && <span className="mt-switch__label">{label}</span>}
      {children}
    </div>
  ),
);
Switch.displayName = 'Switch';
