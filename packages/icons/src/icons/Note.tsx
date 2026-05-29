import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Note duotone icon. */
export const Note: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M122 82 L142 190 M98 118 A40 40 0 1 0 162 186" />}
  />
);
