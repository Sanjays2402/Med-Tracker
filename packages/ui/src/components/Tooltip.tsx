import * as React from 'react';
import { cn } from '../cn';

/** Hover or focus tooltip. */
export interface TooltipProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Tooltip"
      data-variant={variant}
      className={cn('mt-tooltip', className)}
      {...rest}
    >
      {label != null && <span className="mt-tooltip__label">{label}</span>}
      {children}
    </div>
  ),
);
Tooltip.displayName = 'Tooltip';
