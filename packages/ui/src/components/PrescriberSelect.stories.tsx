import * as React from 'react';
import { PrescriberSelect } from './PrescriberSelect';

export default { title: 'Med-Tracker/PrescriberSelect', component: PrescriberSelect };

export const Default = () => <PrescriberSelect>Async select for prescribers.</PrescriberSelect>;
export const Subtle = () => <PrescriberSelect variant="subtle">Async select for prescribers.</PrescriberSelect>;
export const Strong = () => <PrescriberSelect variant="strong" label="Label">Async select for prescribers.</PrescriberSelect>;
