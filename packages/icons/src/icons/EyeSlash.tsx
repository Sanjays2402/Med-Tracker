import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** EyeSlash duotone icon. */
export const EyeSlash: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M127 99 L173 181 M123 121 A40 40 0 1 0 171 175" />}
  />
);
