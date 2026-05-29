import * as React from 'react';
import { Calendar } from './Calendar';

export default { title: 'Med-Tracker/Calendar', component: Calendar };

export const Default = () => <Calendar>Month grid calendar.</Calendar>;
export const Subtle = () => <Calendar variant="subtle">Month grid calendar.</Calendar>;
export const Strong = () => <Calendar variant="strong" label="Label">Month grid calendar.</Calendar>;
