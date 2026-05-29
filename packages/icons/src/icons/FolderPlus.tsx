import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** FolderPlus duotone icon. */
export const FolderPlus: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M74 98 L190 174 M114 102 A40 40 0 1 0 178 170" />}
  />
);
