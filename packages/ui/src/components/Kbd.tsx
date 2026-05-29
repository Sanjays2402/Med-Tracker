import * as React from 'react';
import { cn } from '../cn';

/** Keyboard shortcut. */
export interface KbdProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Kbd = React.forwardRef<HTMLDivElement, KbdProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Kbd"
      data-variant={variant}
      className={cn('mt-kbd', className)}
      {...rest}
    >
      {label != null && <span className="mt-kbd__label">{label}</span>}
      {children}
    </div>
  ),
);
Kbd.displayName = 'Kbd';
