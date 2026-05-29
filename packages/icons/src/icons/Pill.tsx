import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Pill duotone icon. */
export const Pill: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M64 64 L128 128 M96 96 A40 40 0 1 0 160 160" />}
  />
);
