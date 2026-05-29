import * as React from 'react';
import { LanguageSwitcher } from './LanguageSwitcher';

export default { title: 'Med-Tracker/LanguageSwitcher', component: LanguageSwitcher };

export const Default = () => <LanguageSwitcher>Select between en, es, hi, fr.</LanguageSwitcher>;
export const Subtle = () => <LanguageSwitcher variant="subtle">Select between en, es, hi, fr.</LanguageSwitcher>;
export const Strong = () => <LanguageSwitcher variant="strong" label="Label">Select between en, es, hi, fr.</LanguageSwitcher>;
