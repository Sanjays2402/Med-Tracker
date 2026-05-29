import * as React from 'react';
import { Fieldset } from './Fieldset';

export default { title: 'Med-Tracker/Fieldset', component: Fieldset };

export const Default = () => <Fieldset>Logical grouping for related fields.</Fieldset>;
export const Subtle = () => <Fieldset variant="subtle">Logical grouping for related fields.</Fieldset>;
export const Strong = () => <Fieldset variant="strong" label="Label">Logical grouping for related fields.</Fieldset>;
