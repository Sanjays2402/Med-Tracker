import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Bell duotone icon. */
export const Bell: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M70 110 L178 130 M126 106 A40 40 0 1 0 190 166" />}
  />
);
