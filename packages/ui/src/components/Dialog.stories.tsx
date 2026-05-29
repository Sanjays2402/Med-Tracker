import * as React from 'react';
import { Dialog } from './Dialog';

export default { title: 'Med-Tracker/Dialog', component: Dialog };

export const Default = () => <Dialog>Modal dialog.</Dialog>;
export const Subtle = () => <Dialog variant="subtle">Modal dialog.</Dialog>;
export const Strong = () => <Dialog variant="strong" label="Label">Modal dialog.</Dialog>;
