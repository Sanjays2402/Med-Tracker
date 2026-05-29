import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** File duotone icon. */
export const File: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M81 109 L131 187 M117 119 A40 40 0 1 0 165 161" />}
  />
);
