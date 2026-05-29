import * as React from 'react';
import { TrendChart } from './TrendChart';

export default { title: 'Med-Tracker/TrendChart', component: TrendChart };

export const Default = () => <TrendChart>Line chart for trends.</TrendChart>;
export const Subtle = () => <TrendChart variant="subtle">Line chart for trends.</TrendChart>;
export const Strong = () => <TrendChart variant="strong" label="Label">Line chart for trends.</TrendChart>;
