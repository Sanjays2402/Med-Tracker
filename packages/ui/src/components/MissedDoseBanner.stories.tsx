import * as React from 'react';
import { MissedDoseBanner } from './MissedDoseBanner';

export default { title: 'Med-Tracker/MissedDoseBanner', component: MissedDoseBanner };

export const Default = () => <MissedDoseBanner>Sticky banner for missed doses.</MissedDoseBanner>;
export const Subtle = () => <MissedDoseBanner variant="subtle">Sticky banner for missed doses.</MissedDoseBanner>;
export const Strong = () => <MissedDoseBanner variant="strong" label="Label">Sticky banner for missed doses.</MissedDoseBanner>;
