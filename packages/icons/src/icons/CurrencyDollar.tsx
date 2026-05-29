import * as React from 'react';
import { DuotoneIcon, type IconProps } from '../Icon';

/** CurrencyDollar duotone icon. */
export const CurrencyDollar: React.FC<IconProps> = (props) => (
  <DuotoneIcon
    {...props}
    secondary={<circle cx="128" cy="128" r="96" />}
    primary={<path d="M118 94 L130 146 M110 122 A40 40 0 1 0 174 182" />}
  />
);
