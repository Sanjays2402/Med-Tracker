import * as React from 'react';
import { Drawer } from './Drawer';

export default { title: 'Med-Tracker/Drawer', component: Drawer };

export const Default = () => <Drawer>Side drawer.</Drawer>;
export const Subtle = () => <Drawer variant="subtle">Side drawer.</Drawer>;
export const Strong = () => <Drawer variant="strong" label="Label">Side drawer.</Drawer>;
