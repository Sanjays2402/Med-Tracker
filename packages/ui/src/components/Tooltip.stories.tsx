import * as React from 'react';
import { Tooltip } from './Tooltip';

export default { title: 'Med-Tracker/Tooltip', component: Tooltip };

export const Default = () => <Tooltip>Hover or focus tooltip.</Tooltip>;
export const Subtle = () => <Tooltip variant="subtle">Hover or focus tooltip.</Tooltip>;
export const Strong = () => <Tooltip variant="strong" label="Label">Hover or focus tooltip.</Tooltip>;
