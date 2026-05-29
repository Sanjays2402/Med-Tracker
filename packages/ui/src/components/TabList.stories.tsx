import * as React from 'react';
import { TabList } from './TabList';

export default { title: 'Med-Tracker/TabList', component: TabList };

export const Default = () => <TabList>Tab list container.</TabList>;
export const Subtle = () => <TabList variant="subtle">Tab list container.</TabList>;
export const Strong = () => <TabList variant="strong" label="Label">Tab list container.</TabList>;
