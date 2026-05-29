import * as React from 'react';
import { cn } from '../cn';

/** Single notification row. */
export interface NotificationItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const NotificationItem = React.forwardRef<HTMLDivElement, NotificationItemProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="NotificationItem"
      data-variant={variant}
      className={cn('mt-notificationitem', className)}
      {...rest}
    >
      {label != null && <span className="mt-notificationitem__label">{label}</span>}
      {children}
    </div>
  ),
);
NotificationItem.displayName = 'NotificationItem';
