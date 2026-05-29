import * as React from 'react';
import { CardBody } from './CardBody';

export default { title: 'Med-Tracker/CardBody', component: CardBody };

export const Default = () => <CardBody>Body slot inside a Card.</CardBody>;
export const Subtle = () => <CardBody variant="subtle">Body slot inside a Card.</CardBody>;
export const Strong = () => <CardBody variant="strong" label="Label">Body slot inside a Card.</CardBody>;
