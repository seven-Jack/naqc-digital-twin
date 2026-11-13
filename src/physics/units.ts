import { H, TAU } from './constants';

export const nm = (value: number) => value * 1e-9;
export const um = (value: number) => value * 1e-6;
export const mW = (value: number) => value * 1e-3;
export const us = (value: number) => value * 1e-6;
export const kHz = (value: number) => value * 1e3;
export const joulesToHz = (value: number) => value / H;
export const hzToAngular = (value: number) => TAU * value;
