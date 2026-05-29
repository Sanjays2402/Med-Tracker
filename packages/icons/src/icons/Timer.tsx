import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Timer duotone icon. */
export const Timer: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M69 81 L159 183 M121 99 A40 40 0 1 0 169 181" />}
  />
);
