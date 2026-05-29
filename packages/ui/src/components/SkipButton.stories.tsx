import * as React from 'react';
import { SkipButton } from './SkipButton';

export default { title: 'Med-Tracker/SkipButton', component: SkipButton };

export const Default = () => <SkipButton>Button to skip a dose.</SkipButton>;
export const Subtle = () => <SkipButton variant="subtle">Button to skip a dose.</SkipButton>;
export const Strong = () => <SkipButton variant="strong" label="Label">Button to skip a dose.</SkipButton>;
