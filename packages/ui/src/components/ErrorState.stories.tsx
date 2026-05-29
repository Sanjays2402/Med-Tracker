import * as React from 'react';
import { ErrorState } from './ErrorState';

export default { title: 'Med-Tracker/ErrorState', component: ErrorState };

export const Default = () => <ErrorState>Error illustration and retry.</ErrorState>;
export const Subtle = () => <ErrorState variant="subtle">Error illustration and retry.</ErrorState>;
export const Strong = () => <ErrorState variant="strong" label="Label">Error illustration and retry.</ErrorState>;
