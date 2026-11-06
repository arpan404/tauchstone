// The host should import this entry only; Three.js stays in the lazy chunk.
import { lazy } from 'react';
export const ExpoScene = lazy(() => import('./ExpoScene'));
