import * as React from 'react';
import { Banner } from './Banner';

export default { title: 'Med-Tracker/Banner', component: Banner };

export const Default = () => <Banner>Page level banner.</Banner>;
export const Subtle = () => <Banner variant="subtle">Page level banner.</Banner>;
export const Strong = () => <Banner variant="strong" label="Label">Page level banner.</Banner>;
