import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** BoxArrowUp duotone icon. */
export const BoxArrowUp: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M121 117 L187 179 M125 111 A40 40 0 1 0 173 169" />}
  />
);
