import * as React from 'react';
import { SchedulePreview } from './SchedulePreview';

export default { title: 'Med-Tracker/SchedulePreview', component: SchedulePreview };

export const Default = () => <SchedulePreview>Read only preview of a schedule.</SchedulePreview>;
export const Subtle = () => <SchedulePreview variant="subtle">Read only preview of a schedule.</SchedulePreview>;
export const Strong = () => <SchedulePreview variant="strong" label="Label">Read only preview of a schedule.</SchedulePreview>;
