import * as React from 'react';
import { MenuDivider } from './MenuDivider';

export default { title: 'Med-Tracker/MenuDivider', component: MenuDivider };

export const Default = () => <MenuDivider>Menu separator.</MenuDivider>;
export const Subtle = () => <MenuDivider variant="subtle">Menu separator.</MenuDivider>;
export const Strong = () => <MenuDivider variant="strong" label="Label">Menu separator.</MenuDivider>;
