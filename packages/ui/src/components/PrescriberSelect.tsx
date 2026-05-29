import * as React from 'react';
import { cn } from '../cn';

/** Async select for prescribers. */
export interface PrescriberSelectProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const PrescriberSelect = React.forwardRef<HTMLDivElement, PrescriberSelectProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="PrescriberSelect"
      data-variant={variant}
      className={cn('mt-prescriberselect', className)}
      {...rest}
    >
      {label != null && <span className="mt-prescriberselect__label">{label}</span>}
      {children}
    </div>
  ),
);
PrescriberSelect.displayName = 'PrescriberSelect';
