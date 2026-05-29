import * as React from 'react';
import { cn } from '../cn';

/** Initials or image avatar. */
export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Avatar"
      data-variant={variant}
      className={cn('mt-avatar', className)}
      {...rest}
    >
      {label != null && <span className="mt-avatar__label">{label}</span>}
      {children}
    </div>
  ),
);
Avatar.displayName = 'Avatar';
