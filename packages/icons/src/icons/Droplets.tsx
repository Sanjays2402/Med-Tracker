import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Droplets duotone icon. */
export const Droplets: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M87 91 L181 189 M115 97 A40 40 0 1 0 163 167" />}
  />
);
