import * as React from 'react';
import { cn } from '../cn';

/** Headline adherence percent and trend. */
export interface AdherenceSummaryProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const AdherenceSummary = React.forwardRef<HTMLDivElement, AdherenceSummaryProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="AdherenceSummary"
      data-variant={variant}
      className={cn('mt-adherencesummary', className)}
      {...rest}
    >
      {label != null && <span className="mt-adherencesummary__label">{label}</span>}
      {children}
    </div>
  ),
);
AdherenceSummary.displayName = 'AdherenceSummary';
