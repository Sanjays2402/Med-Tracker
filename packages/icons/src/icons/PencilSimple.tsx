import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** PencilSimple duotone icon. */
export const PencilSimple: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M79 115 L157 165 M107 105 A40 40 0 1 0 187 191" />}
  />
);
