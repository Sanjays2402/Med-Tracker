import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Star duotone icon. */
export const Star: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M109 89 L151 175 M97 123 A40 40 0 1 0 177 189" />}
  />
);
