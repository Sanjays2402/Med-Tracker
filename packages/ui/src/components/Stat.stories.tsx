import * as React from 'react';
import { Stat } from './Stat';

export default { title: 'Med-Tracker/Stat', component: Stat };

export const Default = () => <Stat>Single metric with label and value.</Stat>;
export const Subtle = () => <Stat variant="subtle">Single metric with label and value.</Stat>;
export const Strong = () => <Stat variant="strong" label="Label">Single metric with label and value.</Stat>;
