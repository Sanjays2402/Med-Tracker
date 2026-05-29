import * as React from 'react';
import { CalendarDay } from './CalendarDay';

export default { title: 'Med-Tracker/CalendarDay', component: CalendarDay };

export const Default = () => <CalendarDay>Single day cell.</CalendarDay>;
export const Subtle = () => <CalendarDay variant="subtle">Single day cell.</CalendarDay>;
export const Strong = () => <CalendarDay variant="strong" label="Label">Single day cell.</CalendarDay>;
