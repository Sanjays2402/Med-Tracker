import * as React from 'react';
import { Toast } from './Toast';

export default { title: 'Med-Tracker/Toast', component: Toast };

export const Default = () => <Toast>Transient notification.</Toast>;
export const Subtle = () => <Toast variant="subtle">Transient notification.</Toast>;
export const Strong = () => <Toast variant="strong" label="Label">Transient notification.</Toast>;
