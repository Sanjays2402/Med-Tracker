import * as React from 'react';
import { cn } from '../cn';

/** Page level banner. */
export interface BannerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Banner"
      data-variant={variant}
      className={cn('mt-banner', className)}
      {...rest}
    >
      {label != null && <span className="mt-banner__label">{label}</span>}
      {children}
    </div>
  ),
);
Banner.displayName = 'Banner';
