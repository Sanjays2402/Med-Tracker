import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Home duotone icon. */
export const Home: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M82 74 L150 134 M122 126 A40 40 0 1 0 186 178" />}
  />
);
