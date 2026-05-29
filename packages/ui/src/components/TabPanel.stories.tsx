import * as React from 'react';
import { TabPanel } from './TabPanel';

export default { title: 'Med-Tracker/TabPanel', component: TabPanel };

export const Default = () => <TabPanel>Tab panel.</TabPanel>;
export const Subtle = () => <TabPanel variant="subtle">Tab panel.</TabPanel>;
export const Strong = () => <TabPanel variant="strong" label="Label">Tab panel.</TabPanel>;
