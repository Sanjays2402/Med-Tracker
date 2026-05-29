import * as React from 'react';
import { cn } from '../cn';

/** Modal body. */
export interface DialogBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const DialogBody = React.forwardRef<HTMLDivElement, DialogBodyProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="DialogBody"
      data-variant={variant}
      className={cn('mt-dialogbody', className)}
      {...rest}
    >
      {label != null && <span className="mt-dialogbody__label">{label}</span>}
      {children}
    </div>
  ),
);
DialogBody.displayName = 'DialogBody';
