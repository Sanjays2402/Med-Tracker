import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** XCircle duotone icon. */
export const XCircle: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M65 93 L147 139 M101 103 A40 40 0 1 0 181 177" />}
  />
);
