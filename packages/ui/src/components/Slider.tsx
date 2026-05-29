import * as React from 'react';
import { cn } from '../cn';

/** Single value slider. */
export interface SliderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant. */
  variant?: 'default' | 'subtle' | 'strong';
  /** Optional label rendered before children. */
  label?: React.ReactNode;
}

export const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ className, variant = 'default', label, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-component="Slider"
      data-variant={variant}
      className={cn('mt-slider', className)}
      {...rest}
    >
      {label != null && <span className="mt-slider__label">{label}</span>}
      {children}
    </div>
  ),
);
Slider.displayName = 'Slider';
