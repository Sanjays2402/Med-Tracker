import * as React from 'react';
import { Alert } from './Alert';

export default { title: 'Med-Tracker/Alert', component: Alert };

export const Default = () => <Alert>Inline alert with severity.</Alert>;
export const Subtle = () => <Alert variant="subtle">Inline alert with severity.</Alert>;
export const Strong = () => <Alert variant="strong" label="Label">Inline alert with severity.</Alert>;
