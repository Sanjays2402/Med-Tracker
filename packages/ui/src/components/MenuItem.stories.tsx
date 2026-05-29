import * as React from 'react';
import { MenuItem } from './MenuItem';

export default { title: 'Med-Tracker/MenuItem', component: MenuItem };

export const Default = () => <MenuItem>Menu entry.</MenuItem>;
export const Subtle = () => <MenuItem variant="subtle">Menu entry.</MenuItem>;
export const Strong = () => <MenuItem variant="strong" label="Label">Menu entry.</MenuItem>;
