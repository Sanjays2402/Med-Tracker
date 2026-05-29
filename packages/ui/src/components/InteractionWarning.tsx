import * as React from 'react';
import { cn } from '../cn';

/** Banner shown when interactions are detected. */
export interface InteractionWarningProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const InteractionWarning = React.forwardRef<HTMLDivElement, InteractionWarningProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="InteractionWarning"
      data-variant={variant}
      className={cn('mt-interactionwarning', className)}
      {...rest}
    >
      {label != null && <span className="mt-interactionwarning__label">{label}</span>}
      {children}
    </div>
  ),
);
InteractionWarning.displayName = 'InteractionWarning';
