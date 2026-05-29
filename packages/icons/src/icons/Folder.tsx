import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Folder duotone icon. */
export const Folder: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M124 76 L180 148 M108 100 A40 40 0 1 0 172 188" />}
  />
);
