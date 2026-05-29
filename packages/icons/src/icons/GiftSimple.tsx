import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** GiftSimple duotone icon. */
export const GiftSimple: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M90 114 L174 158 M98 118 A40 40 0 1 0 162 186" />}
  />
);
