import * as React from 'react';
import { FileInput } from './FileInput';

export default { title: 'Med-Tracker/FileInput', component: FileInput };

export const Default = () => <FileInput>File chooser.</FileInput>;
export const Subtle = () => <FileInput variant="subtle">File chooser.</FileInput>;
export const Strong = () => <FileInput variant="strong" label="Label">File chooser.</FileInput>;
