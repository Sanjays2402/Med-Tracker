import * as React from 'react';
import { Pill } from './Pill';

export default { title: 'Med-Tracker/Pill', component: Pill };

export const Default = () => <Pill>Pill shaped indicator. Doubles as a medication card.</Pill>;
export const Subtle = () => <Pill variant="subtle">Pill shaped indicator. Doubles as a medication card.</Pill>;
export const Strong = () => <Pill variant="strong" label="Label">Pill shaped indicator. Doubles as a medication card.</Pill>;
