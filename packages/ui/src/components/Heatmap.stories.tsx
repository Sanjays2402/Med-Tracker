import * as React from 'react';
import { Heatmap } from './Heatmap';

export default { title: 'Med-Tracker/Heatmap', component: Heatmap };

export const Default = () => <Heatmap>Day grid heatmap.</Heatmap>;
export const Subtle = () => <Heatmap variant="subtle">Day grid heatmap.</Heatmap>;
export const Strong = () => <Heatmap variant="strong" label="Label">Day grid heatmap.</Heatmap>;
