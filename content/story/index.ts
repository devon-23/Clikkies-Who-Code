// Story content: missions, evidence, achievements and hidden codes.
//
// SERVER-ONLY. This folder holds answers and unreleased story. It is compiled
// into the Worker and must never be imported by anything in src/app -- a
// test (tests/content/boundary.test.ts) fails if it is.
//
// Blurryface's missions arrive in Milestone 4. Until then the lists are empty
// and every campaign stays "in development" or "planned".

import { achievements } from './achievements.ts';
import { evidence } from './evidence.ts';
import { hiddenCodes } from './hidden.ts';
import { missions } from './missions.ts';

export const story = { missions, evidence, achievements, hiddenCodes };
