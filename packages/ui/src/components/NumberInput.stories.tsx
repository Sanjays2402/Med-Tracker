import * as React from 'react';
import { NumberInput } from './NumberInput';

export default { title: 'Med-Tracker/NumberInput', component: NumberInput };

export const Default = () => <NumberInput>Numeric stepper.</NumberInput>;
export const Subtle = () => <NumberInput variant="subtle">Numeric stepper.</NumberInput>;
export const Strong = () => <NumberInput variant="strong" label="Label">Numeric stepper.</NumberInput>;
