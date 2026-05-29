import * as React from 'react';
import { Tabs } from './Tabs';

export default { title: 'Med-Tracker/Tabs', component: Tabs };

export const Default = () => <Tabs>Tabbed interface.</Tabs>;
export const Subtle = () => <Tabs variant="subtle">Tabbed interface.</Tabs>;
export const Strong = () => <Tabs variant="strong" label="Label">Tabbed interface.</Tabs>;
