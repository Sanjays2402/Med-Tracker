import * as React from 'react';
import { Spinner } from './Spinner';

export default { title: 'Med-Tracker/Spinner', component: Spinner };

export const Default = () => <Spinner>Loading spinner.</Spinner>;
export const Subtle = () => <Spinner variant="subtle">Loading spinner.</Spinner>;
export const Strong = () => <Spinner variant="strong" label="Label">Loading spinner.</Spinner>;
