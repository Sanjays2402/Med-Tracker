import * as React from 'react';
import { cn } from '../cn';

/** Container with padded surface. */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Card"
      data-variant={variant}
      className={cn('mt-card', className)}
      {...rest}
    >
      {label != null && <span className="mt-card__label">{label}</span>}
      {children}
    </div>
  ),
);
Card.displayName = 'Card';
