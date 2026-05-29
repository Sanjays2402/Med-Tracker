import * as React from 'react';
import { List } from './List';

export default { title: 'Med-Tracker/List', component: List };

export const Default = () => <List>Vertical list container.</List>;
export const Subtle = () => <List variant="subtle">Vertical list container.</List>;
export const Strong = () => <List variant="strong" label="Label">Vertical list container.</List>;
