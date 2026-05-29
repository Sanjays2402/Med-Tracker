import * as React from 'react';
import { QuietHoursToggle } from './QuietHoursToggle';

export default { title: 'Med-Tracker/QuietHoursToggle', component: QuietHoursToggle };

export const Default = () => <QuietHoursToggle>Toggle quiet hours behaviour.</QuietHoursToggle>;
export const Subtle = () => <QuietHoursToggle variant="subtle">Toggle quiet hours behaviour.</QuietHoursToggle>;
export const Strong = () => <QuietHoursToggle variant="strong" label="Label">Toggle quiet hours behaviour.</QuietHoursToggle>;
