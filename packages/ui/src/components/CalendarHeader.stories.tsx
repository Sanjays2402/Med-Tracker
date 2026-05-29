import * as React from 'react';
import { CalendarHeader } from './CalendarHeader';

export default { title: 'Med-Tracker/CalendarHeader', component: CalendarHeader };

export const Default = () => <CalendarHeader>Calendar header row.</CalendarHeader>;
export const Subtle = () => <CalendarHeader variant="subtle">Calendar header row.</CalendarHeader>;
export const Strong = () => <CalendarHeader variant="strong" label="Label">Calendar header row.</CalendarHeader>;
