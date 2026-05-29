import * as React from 'react';
import { Tab } from './Tab';

export default { title: 'Med-Tracker/Tab', component: Tab };

export const Default = () => <Tab>Single tab trigger.</Tab>;
export const Subtle = () => <Tab variant="subtle">Single tab trigger.</Tab>;
export const Strong = () => <Tab variant="strong" label="Label">Single tab trigger.</Tab>;
