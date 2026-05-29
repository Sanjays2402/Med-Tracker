import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** SparkleStar duotone icon. */
export const SparkleStar: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M123 111 L161 137 M103 125 A40 40 0 1 0 183 171" />}
  />
);
