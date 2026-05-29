import * as React from 'react';
import { Label } from './Label';

export default { title: 'Med-Tracker/Label', component: Label };

export const Default = () => <Label>Form control label.</Label>;
export const Subtle = () => <Label variant="subtle">Form control label.</Label>;
export const Strong = () => <Label variant="strong" label="Label">Form control label.</Label>;
