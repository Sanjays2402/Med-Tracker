import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Eraser duotone icon. */
export const Eraser: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M86 126 L162 178 M110 122 A40 40 0 1 0 174 182" />}
  />
);
