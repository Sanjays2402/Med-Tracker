import * as React from 'react';
import { Popover } from './Popover';

export default { title: 'Med-Tracker/Popover', component: Popover };

export const Default = () => <Popover>Anchored popover.</Popover>;
export const Subtle = () => <Popover variant="subtle">Anchored popover.</Popover>;
export const Strong = () => <Popover variant="strong" label="Label">Anchored popover.</Popover>;
