import * as React from 'react';
import { AdherenceSummary } from './AdherenceSummary';

export default { title: 'Med-Tracker/AdherenceSummary', component: AdherenceSummary };

export const Default = () => <AdherenceSummary>Headline adherence percent and trend.</AdherenceSummary>;
export const Subtle = () => <AdherenceSummary variant="subtle">Headline adherence percent and trend.</AdherenceSummary>;
export const Strong = () => <AdherenceSummary variant="strong" label="Label">Headline adherence percent and trend.</AdherenceSummary>;
