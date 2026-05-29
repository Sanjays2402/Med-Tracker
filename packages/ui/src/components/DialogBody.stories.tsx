import * as React from 'react';
import { DialogBody } from './DialogBody';

export default { title: 'Med-Tracker/DialogBody', component: DialogBody };

export const Default = () => <DialogBody>Modal body.</DialogBody>;
export const Subtle = () => <DialogBody variant="subtle">Modal body.</DialogBody>;
export const Strong = () => <DialogBody variant="strong" label="Label">Modal body.</DialogBody>;
