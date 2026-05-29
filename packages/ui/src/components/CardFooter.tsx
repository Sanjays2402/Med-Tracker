import * as React from 'react';
import { cn } from '../cn';

/** Footer slot inside a Card. */
export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="CardFooter"
      data-variant={variant}
      className={cn('mt-cardfooter', className)}
      {...rest}
    >
      {label != null && <span className="mt-cardfooter__label">{label}</span>}
      {children}
    </div>
  ),
);
CardFooter.displayName = 'CardFooter';
