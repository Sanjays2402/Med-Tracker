import * as React from 'react';
import { cn } from '../cn';

/** Cmd+K search dialog. */
export interface CommandPaletteProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const CommandPalette = React.forwardRef<HTMLDivElement, CommandPaletteProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="CommandPalette"
      data-variant={variant}
      className={cn('mt-commandpalette', className)}
      {...rest}
    >
      {label != null && <span className="mt-commandpalette__label">{label}</span>}
      {children}
    </div>
  ),
);
CommandPalette.displayName = 'CommandPalette';
