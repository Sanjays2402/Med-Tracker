import * as React from 'react';
import { WeeklyChart } from './WeeklyChart';

export default { title: 'Med-Tracker/WeeklyChart', component: WeeklyChart };

export const Default = () => <WeeklyChart>7 day adherence bar chart.</WeeklyChart>;
export const Subtle = () => <WeeklyChart variant="subtle">7 day adherence bar chart.</WeeklyChart>;
export const Strong = () => <WeeklyChart variant="strong" label="Label">7 day adherence bar chart.</WeeklyChart>;
