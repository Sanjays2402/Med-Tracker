import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** HeartCheck duotone icon. */
export const HeartCheck: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M99 119 L153 129 M111 117 A40 40 0 1 0 191 179" />}
  />
);
