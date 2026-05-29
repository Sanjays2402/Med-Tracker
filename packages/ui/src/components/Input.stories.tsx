import * as React from 'react';
import { Input } from './Input';

export default { title: 'Med-Tracker/Input', component: Input };

export const Default = () => <Input>Single line text input.</Input>;
export const Subtle = () => <Input variant="subtle">Single line text input.</Input>;
export const Strong = () => <Input variant="strong" label="Label">Single line text input.</Input>;
