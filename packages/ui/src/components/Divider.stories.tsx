import * as React from 'react';
import { Divider } from './Divider';

export default { title: 'Med-Tracker/Divider', component: Divider };

export const Default = () => <Divider>Horizontal or vertical separator.</Divider>;
export const Subtle = () => <Divider variant="subtle">Horizontal or vertical separator.</Divider>;
export const Strong = () => <Divider variant="strong" label="Label">Horizontal or vertical separator.</Divider>;
