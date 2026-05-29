import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** CaretUp duotone icon. */
export const CaretUp: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M76 92 L164 132 M124 116 A40 40 0 1 0 188 172" />}
  />
);
