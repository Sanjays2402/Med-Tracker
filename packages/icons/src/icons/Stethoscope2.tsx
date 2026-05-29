import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Stethoscope2 duotone icon. */
export const Stethoscope2: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M102 78 L146 162 M126 106 A40 40 0 1 0 190 166" />}
  />
);
