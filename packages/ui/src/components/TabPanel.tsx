import * as React from 'react';
import { cn } from '../cn';

/** Tab panel. */
export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const TabPanel = React.forwardRef<HTMLDivElement, TabPanelProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="TabPanel"
      data-variant={variant}
      className={cn('mt-tabpanel', className)}
      {...rest}
    >
      {label != null && <span className="mt-tabpanel__label">{label}</span>}
      {children}
    </div>
  ),
);
TabPanel.displayName = 'TabPanel';
