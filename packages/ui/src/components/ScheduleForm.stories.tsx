import * as React from 'react';
import { ScheduleForm } from './ScheduleForm';

export default { title: 'Med-Tracker/ScheduleForm', component: ScheduleForm };

export const Default = () => <ScheduleForm>Form to define schedules.</ScheduleForm>;
export const Subtle = () => <ScheduleForm variant="subtle">Form to define schedules.</ScheduleForm>;
export const Strong = () => <ScheduleForm variant="strong" label="Label">Form to define schedules.</ScheduleForm>;
