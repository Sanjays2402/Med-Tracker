import * as React from 'react';
import { NavItem } from './NavItem';

export default { title: 'Med-Tracker/NavItem', component: NavItem };

export const Default = () => <NavItem>Top navigation item.</NavItem>;
export const Subtle = () => <NavItem variant="subtle">Top navigation item.</NavItem>;
export const Strong = () => <NavItem variant="strong" label="Label">Top navigation item.</NavItem>;
