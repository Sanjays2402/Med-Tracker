import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Virus duotone icon. */
export const Virus: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M94 102 L186 138 M118 114 A40 40 0 1 0 182 190" />}
  />
);
