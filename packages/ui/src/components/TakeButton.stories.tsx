import * as React from 'react';
import { TakeButton } from './TakeButton';

export default { title: 'Med-Tracker/TakeButton', component: TakeButton };

export const Default = () => <TakeButton>Big button to mark a dose taken.</TakeButton>;
export const Subtle = () => <TakeButton variant="subtle">Big button to mark a dose taken.</TakeButton>;
export const Strong = () => <TakeButton variant="strong" label="Label">Big button to mark a dose taken.</TakeButton>;
