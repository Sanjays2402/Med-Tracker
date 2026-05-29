import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Patient duotone icon. */
export const Patient: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M75 127 L145 185 M119 109 A40 40 0 1 0 167 187" />}
  />
);
