import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** ChevronUp duotone icon. */
export const ChevronUp: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M104 72 L184 184 M104 120 A40 40 0 1 0 168 168" />}
  />
);
