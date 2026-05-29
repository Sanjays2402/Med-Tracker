import * as React from 'react';
import { cn } from '../cn';

/** Card to manage caregiver share link. */
export interface CaregiverShareCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const CaregiverShareCard = React.forwardRef<HTMLDivElement, CaregiverShareCardProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="CaregiverShareCard"
      data-variant={variant}
      className={cn('mt-caregiversharecard', className)}
      {...rest}
    >
      {label != null && <span className="mt-caregiversharecard__label">{label}</span>}
      {children}
    </div>
  ),
);
CaregiverShareCard.displayName = 'CaregiverShareCard';
