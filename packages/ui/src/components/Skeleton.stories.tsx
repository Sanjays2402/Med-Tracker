import * as React from 'react';
import { Skeleton } from './Skeleton';

export default { title: 'Med-Tracker/Skeleton', component: Skeleton };

export const Default = () => <Skeleton>Placeholder shimmer.</Skeleton>;
export const Subtle = () => <Skeleton variant="subtle">Placeholder shimmer.</Skeleton>;
export const Strong = () => <Skeleton variant="strong" label="Label">Placeholder shimmer.</Skeleton>;
