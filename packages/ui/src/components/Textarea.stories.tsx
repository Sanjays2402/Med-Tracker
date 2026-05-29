import * as React from 'react';
import { Textarea } from './Textarea';

export default { title: 'Med-Tracker/Textarea', component: Textarea };

export const Default = () => <Textarea>Multi line text input.</Textarea>;
export const Subtle = () => <Textarea variant="subtle">Multi line text input.</Textarea>;
export const Strong = () => <Textarea variant="strong" label="Label">Multi line text input.</Textarea>;
