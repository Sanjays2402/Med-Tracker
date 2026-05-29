import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Mail duotone icon. */
export const Mail: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M78 86 L138 154 M102 98 A40 40 0 1 0 166 174" />}
  />
);
