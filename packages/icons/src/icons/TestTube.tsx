import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** TestTube duotone icon. */
export const TestTube: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M66 122 L166 150 M106 110 A40 40 0 1 0 170 162" />}
  />
);
