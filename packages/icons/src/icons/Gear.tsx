import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Gear duotone icon. */
export const Gear: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M107 95 L177 153 M119 109 A40 40 0 1 0 167 187" />}
  />
);
