import * as React from 'react';
import { DoseTimeline } from './DoseTimeline';

export default { title: 'Med-Tracker/DoseTimeline', component: DoseTimeline };

export const Default = () => <DoseTimeline>Timeline of upcoming doses.</DoseTimeline>;
export const Subtle = () => <DoseTimeline variant="subtle">Timeline of upcoming doses.</DoseTimeline>;
export const Strong = () => <DoseTimeline variant="strong" label="Label">Timeline of upcoming doses.</DoseTimeline>;
