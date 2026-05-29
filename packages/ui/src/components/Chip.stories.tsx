import * as React from 'react';
import { Chip } from './Chip';

export default { title: 'Med-Tracker/Chip', component: Chip };

export const Default = () => <Chip>Compact label chip.</Chip>;
export const Subtle = () => <Chip variant="subtle">Compact label chip.</Chip>;
export const Strong = () => <Chip variant="strong" label="Label">Compact label chip.</Chip>;
