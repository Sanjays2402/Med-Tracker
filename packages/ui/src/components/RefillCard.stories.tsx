import * as React from 'react';
import { RefillCard } from './RefillCard';

export default { title: 'Med-Tracker/RefillCard', component: RefillCard };

export const Default = () => <RefillCard>Card showing days of supply left.</RefillCard>;
export const Subtle = () => <RefillCard variant="subtle">Card showing days of supply left.</RefillCard>;
export const Strong = () => <RefillCard variant="strong" label="Label">Card showing days of supply left.</RefillCard>;
