import * as React from 'react';
import { Kbd } from './Kbd';

export default { title: 'Med-Tracker/Kbd', component: Kbd };

export const Default = () => <Kbd>Keyboard shortcut.</Kbd>;
export const Subtle = () => <Kbd variant="subtle">Keyboard shortcut.</Kbd>;
export const Strong = () => <Kbd variant="strong" label="Label">Keyboard shortcut.</Kbd>;
