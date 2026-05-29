import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Check duotone icon. */
export const Check: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M108 124 L132 164 M124 116 A40 40 0 1 0 188 172" />}
  />
);
