import * as React from 'react';
import { Select } from './Select';

export default { title: 'Med-Tracker/Select', component: Select };

export const Default = () => <Select>Native select wrapper.</Select>;
export const Subtle = () => <Select variant="subtle">Native select wrapper.</Select>;
export const Strong = () => <Select variant="strong" label="Label">Native select wrapper.</Select>;
