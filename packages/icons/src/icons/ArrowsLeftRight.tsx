import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** ArrowsLeftRight duotone icon. */
export const ArrowsLeftRight: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M91 79 L129 169 M103 125 A40 40 0 1 0 183 171" />}
  />
);
