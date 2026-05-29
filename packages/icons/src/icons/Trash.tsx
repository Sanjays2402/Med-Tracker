import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Trash duotone icon. */
export const Trash: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M93 73 L167 191 M113 107 A40 40 0 1 0 161 173" />}
  />
);
