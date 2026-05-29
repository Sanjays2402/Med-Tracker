import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** LayoutList duotone icon. */
export const LayoutList: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M89 85 L155 147 M125 111 A40 40 0 1 0 173 169" />}
  />
);
