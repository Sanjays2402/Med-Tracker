import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** CloudMoon duotone icon. */
export const CloudMoon: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M73 69 L171 163 M109 127 A40 40 0 1 0 189 185" />}
  />
);
