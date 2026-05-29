import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Trophy duotone icon. */
export const Trophy: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M83 103 L169 145 M127 101 A40 40 0 1 0 175 163" />}
  />
);
