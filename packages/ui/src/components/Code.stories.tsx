import * as React from 'react';
import { Code } from './Code';

export default { title: 'Med-Tracker/Code', component: Code };

export const Default = () => <Code>Inline code.</Code>;
export const Subtle = () => <Code variant="subtle">Inline code.</Code>;
export const Strong = () => <Code variant="strong" label="Label">Inline code.</Code>;
