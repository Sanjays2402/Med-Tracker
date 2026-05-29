import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** ArrowUp duotone icon. */
export const ArrowUp: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M112 112 L144 144 M112 112 A40 40 0 1 0 176 176" />}
  />
);
