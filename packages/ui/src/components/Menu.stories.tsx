import * as React from 'react';
import { Menu } from './Menu';

export default { title: 'Med-Tracker/Menu', component: Menu };

export const Default = () => <Menu>Dropdown menu.</Menu>;
export const Subtle = () => <Menu variant="subtle">Dropdown menu.</Menu>;
export const Strong = () => <Menu variant="strong" label="Label">Dropdown menu.</Menu>;
