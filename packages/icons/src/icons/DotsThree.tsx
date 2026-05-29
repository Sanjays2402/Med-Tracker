import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** DotsThree duotone icon. */
export const DotsThree: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M110 118 L170 186 M102 98 A40 40 0 1 0 166 174" />}
  />
);
