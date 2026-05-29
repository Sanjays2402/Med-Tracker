import * as React from 'react';
import { cn } from '../cn';

/** Big button to mark a dose taken. */
export interface TakeButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const TakeButton = React.forwardRef<HTMLDivElement, TakeButtonProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="TakeButton"
      data-variant={variant}
      className={cn('mt-takebutton', className)}
      {...rest}
    >
      {label != null && <span className="mt-takebutton__label">{label}</span>}
      {children}
    </div>
  ),
);
TakeButton.displayName = 'TakeButton';
