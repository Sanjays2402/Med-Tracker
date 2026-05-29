import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Bookmark duotone icon. */
export const Bookmark: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M105 101 L139 131 M109 127 A40 40 0 1 0 189 185" />}
  />
);
