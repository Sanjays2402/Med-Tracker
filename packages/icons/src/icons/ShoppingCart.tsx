import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** ShoppingCart duotone icon. */
export const ShoppingCart: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M97 125 L179 171 M101 103 A40 40 0 1 0 181 177" />}
  />
);
