import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Doctor duotone icon. */
export const Doctor: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M125 105 L135 159 M113 107 A40 40 0 1 0 161 173" />}
  />
);
