import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Atom duotone icon. */
export const Atom: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M80 80 L176 176 M112 112 A40 40 0 1 0 176 176" />}
  />
);
