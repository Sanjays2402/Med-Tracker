import * as React from 'react';
import { SidebarItem } from './SidebarItem';

export default { title: 'Med-Tracker/SidebarItem', component: SidebarItem };

export const Default = () => <SidebarItem>Single sidebar entry.</SidebarItem>;
export const Subtle = () => <SidebarItem variant="subtle">Single sidebar entry.</SidebarItem>;
export const Strong = () => <SidebarItem variant="strong" label="Label">Single sidebar entry.</SidebarItem>;
