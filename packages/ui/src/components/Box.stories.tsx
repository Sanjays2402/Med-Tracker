import * as React from 'react';
import { Box } from './Box';

export default { title: 'Med-Tracker/Box', component: Box };

export const Default = () => <Box>Generic styled box.</Box>;
export const Subtle = () => <Box variant="subtle">Generic styled box.</Box>;
export const Strong = () => <Box variant="strong" label="Label">Generic styled box.</Box>;
