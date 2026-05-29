import * as React from 'react';
import { TimePicker } from './TimePicker';

export default { title: 'Med-Tracker/TimePicker', component: TimePicker };

export const Default = () => <TimePicker>Time of day picker.</TimePicker>;
export const Subtle = () => <TimePicker variant="subtle">Time of day picker.</TimePicker>;
export const Strong = () => <TimePicker variant="strong" label="Label">Time of day picker.</TimePicker>;
