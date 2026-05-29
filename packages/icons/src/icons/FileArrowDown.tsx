import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** FileArrowDown duotone icon. */
export const FileArrowDown: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M116 100 L156 188 M100 108 A40 40 0 1 0 164 180" />}
  />
);
