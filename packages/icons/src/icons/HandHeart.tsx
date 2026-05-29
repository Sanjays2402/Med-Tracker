import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** HandHeart duotone icon. */
export const HandHeart: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M81 109 L131 187 M117 119 A40 40 0 1 0 165 161" />}
  />
);
