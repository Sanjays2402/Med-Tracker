import * as React from 'react';
import { cn } from '../cn';

/** Body slot inside a Card. */
export interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const CardBody = React.forwardRef<HTMLDivElement, CardBodyProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="CardBody"
      data-variant={variant}
      className={cn('mt-cardbody', className)}
      {...rest}
    >
      {label != null && <span className="mt-cardbody__label">{label}</span>}
      {children}
    </div>
  ),
);
CardBody.displayName = 'CardBody';
