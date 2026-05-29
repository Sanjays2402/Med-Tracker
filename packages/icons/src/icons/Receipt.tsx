import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Receipt duotone icon. */
export const Receipt: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M68 116 L140 172 M116 124 A40 40 0 1 0 180 164" />}
  />
);
