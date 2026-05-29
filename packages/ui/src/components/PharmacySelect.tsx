import * as React from 'react';
import { cn } from '../cn';

/** Async select for pharmacies. */
export interface PharmacySelectProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const PharmacySelect = React.forwardRef<HTMLDivElement, PharmacySelectProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="PharmacySelect"
      data-variant={variant}
      className={cn('mt-pharmacyselect', className)}
      {...rest}
    >
      {label != null && <span className="mt-pharmacyselect__label">{label}</span>}
      {children}
    </div>
  ),
);
PharmacySelect.displayName = 'PharmacySelect';
