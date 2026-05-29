import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Pencil duotone icon. */
export const Pencil: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M72 104 L152 152 M104 120 A40 40 0 1 0 168 168" />}
  />
);
