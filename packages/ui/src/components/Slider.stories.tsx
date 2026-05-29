import * as React from 'react';
import { Slider } from './Slider';

export default { title: 'Med-Tracker/Slider', component: Slider };

export const Default = () => <Slider>Single value slider.</Slider>;
export const Subtle = () => <Slider variant="subtle">Single value slider.</Slider>;
export const Strong = () => <Slider variant="strong" label="Label">Single value slider.</Slider>;
