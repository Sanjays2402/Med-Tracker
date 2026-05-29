import * as React from 'react';
import { DatePicker } from './DatePicker';

export default { title: 'Med-Tracker/DatePicker', component: DatePicker };

export const Default = () => <DatePicker>Date selection input.</DatePicker>;
export const Subtle = () => <DatePicker variant="subtle">Date selection input.</DatePicker>;
export const Strong = () => <DatePicker variant="strong" label="Label">Date selection input.</DatePicker>;
