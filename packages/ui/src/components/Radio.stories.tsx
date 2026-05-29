import * as React from 'react';
import { Radio } from './Radio';

export default { title: 'Med-Tracker/Radio', component: Radio };

export const Default = () => <Radio>Single radio control.</Radio>;
export const Subtle = () => <Radio variant="subtle">Single radio control.</Radio>;
export const Strong = () => <Radio variant="strong" label="Label">Single radio control.</Radio>;
