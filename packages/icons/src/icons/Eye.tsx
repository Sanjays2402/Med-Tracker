import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Eye duotone icon. */
export const Eye: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M120 88 L168 168 M120 104 A40 40 0 1 0 184 184" />}
  />
);
