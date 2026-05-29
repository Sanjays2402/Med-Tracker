import * as React from 'react';
import { PharmacySelect } from './PharmacySelect';

export default { title: 'Med-Tracker/PharmacySelect', component: PharmacySelect };

export const Default = () => <PharmacySelect>Async select for pharmacies.</PharmacySelect>;
export const Subtle = () => <PharmacySelect variant="subtle">Async select for pharmacies.</PharmacySelect>;
export const Strong = () => <PharmacySelect variant="strong" label="Label">Async select for pharmacies.</PharmacySelect>;
