import * as React from 'react';
import { InteractionWarning } from './InteractionWarning';

export default { title: 'Med-Tracker/InteractionWarning', component: InteractionWarning };

export const Default = () => <InteractionWarning>Banner shown when interactions are detected.</InteractionWarning>;
export const Subtle = () => <InteractionWarning variant="subtle">Banner shown when interactions are detected.</InteractionWarning>;
export const Strong = () => <InteractionWarning variant="strong" label="Label">Banner shown when interactions are detected.</InteractionWarning>;
