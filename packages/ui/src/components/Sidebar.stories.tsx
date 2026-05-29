import * as React from 'react';
import { Sidebar } from './Sidebar';

export default { title: 'Med-Tracker/Sidebar', component: Sidebar };

export const Default = () => <Sidebar>Vertical app navigation.</Sidebar>;
export const Subtle = () => <Sidebar variant="subtle">Vertical app navigation.</Sidebar>;
export const Strong = () => <Sidebar variant="strong" label="Label">Vertical app navigation.</Sidebar>;
