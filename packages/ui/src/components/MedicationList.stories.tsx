import * as React from 'react';
import { MedicationList } from './MedicationList';

export default { title: 'Med-Tracker/MedicationList', component: MedicationList };

export const Default = () => <MedicationList>List of MedicationCard items.</MedicationList>;
export const Subtle = () => <MedicationList variant="subtle">List of MedicationCard items.</MedicationList>;
export const Strong = () => <MedicationList variant="strong" label="Label">List of MedicationCard items.</MedicationList>;
