import * as React from 'react';
import { cn } from '../cn';

/** Card displaying a medication. */
export interface MedicationCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const MedicationCard = React.forwardRef<HTMLDivElement, MedicationCardProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="MedicationCard"
      data-variant={variant}
      className={cn('mt-medicationcard', className)}
      {...rest}
    >
      {label != null && <span className="mt-medicationcard__label">{label}</span>}
      {children}
    </div>
  ),
);
MedicationCard.displayName = 'MedicationCard';
