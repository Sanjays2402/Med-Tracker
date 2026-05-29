import * as React from 'react';
import { cn } from '../cn';

/** Determinate progress bar. */
export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="ProgressBar"
      data-variant={variant}
      className={cn('mt-progressbar', className)}
      {...rest}
    >
      {label != null && <span className="mt-progressbar__label">{label}</span>}
      {children}
    </div>
  ),
);
ProgressBar.displayName = 'ProgressBar';
