import * as React from 'react';
import { cn } from '../cn';

/** List of MedicationCard items. */
export interface MedicationListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const MedicationList = React.forwardRef<HTMLDivElement, MedicationListProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="MedicationList"
      data-variant={variant}
      className={cn('mt-medicationlist', className)}
      {...rest}
    >
      {label != null && <span className="mt-medicationlist__label">{label}</span>}
      {children}
    </div>
  ),
);
MedicationList.displayName = 'MedicationList';
