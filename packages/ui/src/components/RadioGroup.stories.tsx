import * as React from 'react';
import { RadioGroup } from './RadioGroup';

export default { title: 'Med-Tracker/RadioGroup', component: RadioGroup };

export const Default = () => <RadioGroup>Grouped radios.</RadioGroup>;
export const Subtle = () => <RadioGroup variant="subtle">Grouped radios.</RadioGroup>;
export const Strong = () => <RadioGroup variant="strong" label="Label">Grouped radios.</RadioGroup>;
