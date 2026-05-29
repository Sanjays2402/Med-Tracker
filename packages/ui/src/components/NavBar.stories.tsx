import * as React from 'react';
import { NavBar } from './NavBar';

export default { title: 'Med-Tracker/NavBar', component: NavBar };

export const Default = () => <NavBar>Top navigation bar.</NavBar>;
export const Subtle = () => <NavBar variant="subtle">Top navigation bar.</NavBar>;
export const Strong = () => <NavBar variant="strong" label="Label">Top navigation bar.</NavBar>;
