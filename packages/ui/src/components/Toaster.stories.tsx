import * as React from 'react';
import { Toaster } from './Toaster';

export default { title: 'Med-Tracker/Toaster', component: Toaster };

export const Default = () => <Toaster>Toast viewport.</Toaster>;
export const Subtle = () => <Toaster variant="subtle">Toast viewport.</Toaster>;
export const Strong = () => <Toaster variant="strong" label="Label">Toast viewport.</Toaster>;
