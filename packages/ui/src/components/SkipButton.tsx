import * as React from 'react';
import { cn } from '../cn';

/** Button to skip a dose. */
export interface SkipButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const SkipButton = React.forwardRef<HTMLDivElement, SkipButtonProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="SkipButton"
      data-variant={variant}
      className={cn('mt-skipbutton', className)}
      {...rest}
    >
      {label != null && <span className="mt-skipbutton__label">{label}</span>}
      {children}
    </div>
  ),
);
SkipButton.displayName = 'SkipButton';
