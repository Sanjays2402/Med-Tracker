import * as React from 'react';
import { UpcomingDoseBanner } from './UpcomingDoseBanner';

export default { title: 'Med-Tracker/UpcomingDoseBanner', component: UpcomingDoseBanner };

export const Default = () => <UpcomingDoseBanner>Sticky banner with next due dose.</UpcomingDoseBanner>;
export const Subtle = () => <UpcomingDoseBanner variant="subtle">Sticky banner with next due dose.</UpcomingDoseBanner>;
export const Strong = () => <UpcomingDoseBanner variant="strong" label="Label">Sticky banner with next due dose.</UpcomingDoseBanner>;
