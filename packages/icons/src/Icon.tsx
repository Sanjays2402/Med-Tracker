import * as React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  weight?: 'regular' | 'duotone' | 'bold';
}

interface DuotoneIconProps extends IconProps {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}

export const DuotoneIcon: React.FC<DuotoneIconProps> = ({
  size = 24,
  weight = 'duotone',
  primary,
  secondary,
  ...rest
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    {...rest}
  >
    {weight === 'duotone' && secondary && (
      <g opacity={0.2}>{secondary}</g>
    )}
    <g strokeWidth={weight === 'bold' ? 24 : 16} stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {primary}
    </g>
  </svg>
);
