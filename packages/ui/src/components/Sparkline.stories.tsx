import * as React from 'react';
import { Sparkline } from './Sparkline';

export default { title: 'Med-Tracker/Sparkline', component: Sparkline };

export const Default = () => <Sparkline>Tiny inline sparkline.</Sparkline>;
export const Subtle = () => <Sparkline variant="subtle">Tiny inline sparkline.</Sparkline>;
export const Strong = () => <Sparkline variant="strong" label="Label">Tiny inline sparkline.</Sparkline>;
