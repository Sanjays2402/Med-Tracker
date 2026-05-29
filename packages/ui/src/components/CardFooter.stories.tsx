import * as React from 'react';
import { CardFooter } from './CardFooter';

export default { title: 'Med-Tracker/CardFooter', component: CardFooter };

export const Default = () => <CardFooter>Footer slot inside a Card.</CardFooter>;
export const Subtle = () => <CardFooter variant="subtle">Footer slot inside a Card.</CardFooter>;
export const Strong = () => <CardFooter variant="strong" label="Label">Footer slot inside a Card.</CardFooter>;
