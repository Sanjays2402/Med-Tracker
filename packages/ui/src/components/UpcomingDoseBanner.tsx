import * as React from 'react';
import { cn } from '../cn';

/** Sticky banner with next due dose. */
export interface UpcomingDoseBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const UpcomingDoseBanner = React.forwardRef<HTMLDivElement, UpcomingDoseBannerProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="UpcomingDoseBanner"
      data-variant={variant}
      className={cn('mt-upcomingdosebanner', className)}
      {...rest}
    >
      {label != null && <span className="mt-upcomingdosebanner__label">{label}</span>}
      {children}
    </div>
  ),
);
UpcomingDoseBanner.displayName = 'UpcomingDoseBanner';
