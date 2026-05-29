import * as React from 'react';
import { cn } from '../cn';

/** In app notifications drawer. */
export interface NotificationCenterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const NotificationCenter = React.forwardRef<HTMLDivElement, NotificationCenterProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="NotificationCenter"
      data-variant={variant}
      className={cn('mt-notificationcenter', className)}
      {...rest}
    >
      {label != null && <span className="mt-notificationcenter__label">{label}</span>}
      {children}
    </div>
  ),
);
NotificationCenter.displayName = 'NotificationCenter';
