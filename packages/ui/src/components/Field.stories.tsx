import * as React from 'react';
import { Field } from './Field';

export default { title: 'Med-Tracker/Field', component: Field };

export const Default = () => <Field>Wraps label, input, and help text.</Field>;
export const Subtle = () => <Field variant="subtle">Wraps label, input, and help text.</Field>;
export const Strong = () => <Field variant="strong" label="Label">Wraps label, input, and help text.</Field>;
