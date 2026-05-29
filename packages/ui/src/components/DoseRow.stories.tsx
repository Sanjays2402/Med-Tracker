import * as React from 'react';
import { DoseRow } from './DoseRow';

export default { title: 'Med-Tracker/DoseRow', component: DoseRow };

export const Default = () => <DoseRow>Row showing one dose and its status.</DoseRow>;
export const Subtle = () => <DoseRow variant="subtle">Row showing one dose and its status.</DoseRow>;
export const Strong = () => <DoseRow variant="strong" label="Label">Row showing one dose and its status.</DoseRow>;
