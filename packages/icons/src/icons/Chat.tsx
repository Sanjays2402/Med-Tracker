import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** Chat duotone icon. */
export const Chat: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M92 108 L148 180 M108 100 A40 40 0 1 0 172 188" />}
  />
);
