import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Stethoscope duotone icon. */
export const Stethoscope: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M85 97 L143 167 M105 115 A40 40 0 1 0 185 165" />}
  />
);
