import * as React from 'react';
import { DialogHeader } from './DialogHeader';

export default { title: 'Med-Tracker/DialogHeader', component: DialogHeader };

export const Default = () => <DialogHeader>Modal header.</DialogHeader>;
export const Subtle = () => <DialogHeader variant="subtle">Modal header.</DialogHeader>;
export const Strong = () => <DialogHeader variant="strong" label="Label">Modal header.</DialogHeader>;
