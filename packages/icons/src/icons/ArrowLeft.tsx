import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** ArrowLeft duotone icon. */
export const ArrowLeft: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M126 70 L154 170 M118 114 A40 40 0 1 0 182 190" />}
  />
);
