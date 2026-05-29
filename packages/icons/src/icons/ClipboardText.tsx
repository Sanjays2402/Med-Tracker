import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** ClipboardText duotone icon. */
export const ClipboardText: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M115 71 L137 177 M127 101 A40 40 0 1 0 175 163" />}
  />
);
