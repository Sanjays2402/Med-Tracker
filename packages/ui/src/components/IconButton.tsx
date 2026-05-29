import * as React from 'react';
import { cn } from '../cn';

/** Square button that wraps an icon. */
export interface IconButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLDivElement, IconButtonProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="IconButton"
      data-variant={variant}
      className={cn('mt-iconbutton', className)}
      {...rest}
    >
      {label != null && <span className="mt-iconbutton__label">{label}</span>}
      {children}
    </div>
  ),
);
IconButton.displayName = 'IconButton';
