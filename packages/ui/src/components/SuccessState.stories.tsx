import * as React from 'react';
import { SuccessState } from './SuccessState';

export default { title: 'Med-Tracker/SuccessState', component: SuccessState };

export const Default = () => <SuccessState>Success illustration.</SuccessState>;
export const Subtle = () => <SuccessState variant="subtle">Success illustration.</SuccessState>;
export const Strong = () => <SuccessState variant="strong" label="Label">Success illustration.</SuccessState>;
