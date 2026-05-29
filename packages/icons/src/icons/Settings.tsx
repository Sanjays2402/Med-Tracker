import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Settings duotone icon. */
export const Settings: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M100 84 L172 140 M116 124 A40 40 0 1 0 180 164" />}
  />
);
