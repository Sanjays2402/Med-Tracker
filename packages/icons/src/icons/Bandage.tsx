import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Bandage duotone icon. */
export const Bandage: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M106 66 L158 142 M114 102 A40 40 0 1 0 178 170" />}
  />
);
