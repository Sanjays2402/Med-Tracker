import * as React from 'react';
import { MedicationCard } from './MedicationCard';

export default { title: 'Med-Tracker/MedicationCard', component: MedicationCard };

export const Default = () => <MedicationCard>Card displaying a medication.</MedicationCard>;
export const Subtle = () => <MedicationCard variant="subtle">Card displaying a medication.</MedicationCard>;
export const Strong = () => <MedicationCard variant="strong" label="Label">Card displaying a medication.</MedicationCard>;
