import * as React from 'react';
import { ProgressBar } from './ProgressBar';

export default { title: 'Med-Tracker/ProgressBar', component: ProgressBar };

export const Default = () => <ProgressBar>Determinate progress bar.</ProgressBar>;
export const Subtle = () => <ProgressBar variant="subtle">Determinate progress bar.</ProgressBar>;
export const Strong = () => <ProgressBar variant="strong" label="Label">Determinate progress bar.</ProgressBar>;
