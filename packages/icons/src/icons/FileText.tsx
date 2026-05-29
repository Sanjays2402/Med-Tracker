import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** FileText duotone icon. */
export const FileText: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M88 120 L136 136 M120 104 A40 40 0 1 0 184 184" />}
  />
);
