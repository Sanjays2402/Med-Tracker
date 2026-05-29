import * as React from 'react';
import { ThemeToggle } from './ThemeToggle';

export default { title: 'Med-Tracker/ThemeToggle', component: ThemeToggle };

export const Default = () => <ThemeToggle>Light, dark, and system theme switch.</ThemeToggle>;
export const Subtle = () => <ThemeToggle variant="subtle">Light, dark, and system theme switch.</ThemeToggle>;
export const Strong = () => <ThemeToggle variant="strong" label="Label">Light, dark, and system theme switch.</ThemeToggle>;
