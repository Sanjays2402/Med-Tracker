import * as React from 'react';
import { Badge } from './Badge';

export default { title: 'Med-Tracker/Badge', component: Badge };

export const Default = () => <Badge>Small status badge.</Badge>;
export const Subtle = () => <Badge variant="subtle">Small status badge.</Badge>;
export const Strong = () => <Badge variant="strong" label="Label">Small status badge.</Badge>;
