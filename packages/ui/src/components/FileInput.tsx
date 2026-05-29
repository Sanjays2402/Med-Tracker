import * as React from 'react';
import { cn } from '../cn';

/** File chooser. */
export interface FileInputProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const FileInput = React.forwardRef<HTMLDivElement, FileInputProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="FileInput"
      data-variant={variant}
      className={cn('mt-fileinput', className)}
      {...rest}
    >
      {label != null && <span className="mt-fileinput__label">{label}</span>}
      {children}
    </div>
  ),
);
FileInput.displayName = 'FileInput';
