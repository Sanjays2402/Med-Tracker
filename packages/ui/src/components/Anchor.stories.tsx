import * as React from 'react';
import { Anchor } from './Anchor';

export default { title: 'Med-Tracker/Anchor', component: Anchor };

export const Default = () => <Anchor>Block level anchor for cards.</Anchor>;
export const Subtle = () => <Anchor variant="subtle">Block level anchor for cards.</Anchor>;
export const Strong = () => <Anchor variant="strong" label="Label">Block level anchor for cards.</Anchor>;
