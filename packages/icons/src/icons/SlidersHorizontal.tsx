import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** SlidersHorizontal duotone icon. */
export const SlidersHorizontal: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M114 106 L182 166 M122 126 A40 40 0 1 0 186 178" />}
  />
);
