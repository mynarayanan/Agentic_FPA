import { ENGINE_VERSION } from '@fpa/engine';
import { expect, it } from 'vitest';
import { NARRATIVE_ENGINE_BINDING } from '../src';

it('is wired to the engine package', () => expect(NARRATIVE_ENGINE_BINDING).toBe(ENGINE_VERSION));
