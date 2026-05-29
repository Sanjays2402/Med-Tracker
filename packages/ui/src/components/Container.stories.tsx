import * as React from 'react';
import { Container } from './Container';

export default { title: 'Med-Tracker/Container', component: Container };

export const Default = () => <Container>Centered width constrained wrapper.</Container>;
export const Subtle = () => <Container variant="subtle">Centered width constrained wrapper.</Container>;
export const Strong = () => <Container variant="strong" label="Label">Centered width constrained wrapper.</Container>;
