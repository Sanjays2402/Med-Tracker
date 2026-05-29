import * as React from 'react';
import { ProgressRing } from './ProgressRing';

export default { title: 'Med-Tracker/ProgressRing', component: ProgressRing };

export const Default = () => <ProgressRing>Determinate ring progress.</ProgressRing>;
export const Subtle = () => <ProgressRing variant="subtle">Determinate ring progress.</ProgressRing>;
export const Strong = () => <ProgressRing variant="strong" label="Label">Determinate ring progress.</ProgressRing>;
