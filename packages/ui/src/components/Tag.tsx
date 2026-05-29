import * as React from 'react';
import { cn } from '../cn';

/** Removable tag chip. */
export interface TagProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Tag = React.forwardRef<HTMLDivElement, TagProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Tag"
      data-variant={variant}
      className={cn('mt-tag', className)}
      {...rest}
    >
      {label != null && <span className="mt-tag__label">{label}</span>}
      {children}
    </div>
  ),
);
Tag.displayName = 'Tag';
