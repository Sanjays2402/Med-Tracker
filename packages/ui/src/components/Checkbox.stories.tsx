import * as React from 'react';
import { Checkbox } from './Checkbox';

export default { title: 'Med-Tracker/Checkbox', component: Checkbox };

export const Default = () => <Checkbox>Tri state checkbox.</Checkbox>;
export const Subtle = () => <Checkbox variant="subtle">Tri state checkbox.</Checkbox>;
export const Strong = () => <Checkbox variant="strong" label="Label">Tri state checkbox.</Checkbox>;
