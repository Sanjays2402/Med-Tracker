import * as React from 'react';
import { cn } from '../cn';

/** Block level anchor for cards. */
export interface AnchorProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Anchor = React.forwardRef<HTMLDivElement, AnchorProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Anchor"
      data-variant={variant}
      className={cn('mt-anchor', className)}
      {...rest}
    >
      {label != null && <span className="mt-anchor__label">{label}</span>}
      {children}
    </div>
  ),
);
Anchor.displayName = 'Anchor';
