import * as React from 'react';
import { cn } from '../cn';

/** Multi line text input. */
export interface TextareaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Textarea = React.forwardRef<HTMLDivElement, TextareaProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Textarea"
      data-variant={variant}
      className={cn('mt-textarea', className)}
      {...rest}
    >
      {label != null && <span className="mt-textarea__label">{label}</span>}
      {children}
    </div>
  ),
);
Textarea.displayName = 'Textarea';
