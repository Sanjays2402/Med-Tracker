import * as React from 'react';
import { Sheet } from './Sheet';

export default { title: 'Med-Tracker/Sheet', component: Sheet };

export const Default = () => <Sheet>Bottom sheet for mobile.</Sheet>;
export const Subtle = () => <Sheet variant="subtle">Bottom sheet for mobile.</Sheet>;
export const Strong = () => <Sheet variant="strong" label="Label">Bottom sheet for mobile.</Sheet>;
