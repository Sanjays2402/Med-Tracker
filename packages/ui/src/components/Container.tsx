import * as React from 'react';
import { cn } from '../cn';

/** Centered width constrained wrapper. */
export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Container"
      data-variant={variant}
      className={cn('mt-container', className)}
      {...rest}
    >
      {label != null && <span className="mt-container__label">{label}</span>}
      {children}
    </div>
  ),
);
Container.displayName = 'Container';
