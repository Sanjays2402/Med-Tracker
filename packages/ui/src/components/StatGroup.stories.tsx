import * as React from 'react';
import { StatGroup } from './StatGroup';

export default { title: 'Med-Tracker/StatGroup', component: StatGroup };

export const Default = () => <StatGroup>Row of Stat tiles.</StatGroup>;
export const Subtle = () => <StatGroup variant="subtle">Row of Stat tiles.</StatGroup>;
export const Strong = () => <StatGroup variant="strong" label="Label">Row of Stat tiles.</StatGroup>;
