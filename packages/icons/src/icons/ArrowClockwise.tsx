import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** ArrowClockwise duotone icon. */
export const ArrowClockwise: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M98 90 L134 182 M106 110 A40 40 0 1 0 170 162" />}
  />
);
