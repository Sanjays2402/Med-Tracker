import * as React from 'react';
import { cn } from '../cn';

/** Select between en, es, hi, fr. */
export interface LanguageSwitcherProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const LanguageSwitcher = React.forwardRef<HTMLDivElement, LanguageSwitcherProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="LanguageSwitcher"
      data-variant={variant}
      className={cn('mt-languageswitcher', className)}
      {...rest}
    >
      {label != null && <span className="mt-languageswitcher__label">{label}</span>}
      {children}
    </div>
  ),
);
LanguageSwitcher.displayName = 'LanguageSwitcher';
