import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** FirstAid duotone icon. */
export const FirstAid: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M113 77 L163 155 M117 119 A40 40 0 1 0 165 161" />}
  />
);
