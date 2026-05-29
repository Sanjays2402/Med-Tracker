import * as React from 'react';
import { cn } from '../cn';

/** Sticky banner for missed doses. */
export interface MissedDoseBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const MissedDoseBanner = React.forwardRef<HTMLDivElement, MissedDoseBannerProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="MissedDoseBanner"
      data-variant={variant}
      className={cn('mt-misseddosebanner', className)}
      {...rest}
    >
      {label != null && <span className="mt-misseddosebanner__label">{label}</span>}
      {children}
    </div>
  ),
);
MissedDoseBanner.displayName = 'MissedDoseBanner';
