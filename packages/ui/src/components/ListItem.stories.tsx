import * as React from 'react';
import { ListItem } from './ListItem';

export default { title: 'Med-Tracker/ListItem', component: ListItem };

export const Default = () => <ListItem>List item.</ListItem>;
export const Subtle = () => <ListItem variant="subtle">List item.</ListItem>;
export const Strong = () => <ListItem variant="strong" label="Label">List item.</ListItem>;
