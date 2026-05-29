import * as React from 'react';
import { CaregiverShareCard } from './CaregiverShareCard';

export default { title: 'Med-Tracker/CaregiverShareCard', component: CaregiverShareCard };

export const Default = () => <CaregiverShareCard>Card to manage caregiver share link.</CaregiverShareCard>;
export const Subtle = () => <CaregiverShareCard variant="subtle">Card to manage caregiver share link.</CaregiverShareCard>;
export const Strong = () => <CaregiverShareCard variant="strong" label="Label">Card to manage caregiver share link.</CaregiverShareCard>;
