import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** ChevronDown duotone icon. */
export const ChevronDown: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M111 83 L189 133 M107 105 A40 40 0 1 0 187 191" />}
  />
);
