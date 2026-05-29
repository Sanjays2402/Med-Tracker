import * as React from 'react';
import { Grid } from './Grid';

export default { title: 'Med-Tracker/Grid', component: Grid };

export const Default = () => <Grid>CSS grid wrapper.</Grid>;
export const Subtle = () => <Grid variant="subtle">CSS grid wrapper.</Grid>;
export const Strong = () => <Grid variant="strong" label="Label">CSS grid wrapper.</Grid>;
