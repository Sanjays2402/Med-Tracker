import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** BacteriaCell duotone icon. */
export const BacteriaCell: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M101 113 L191 151 M121 99 A40 40 0 1 0 169 181" />}
  />
);
