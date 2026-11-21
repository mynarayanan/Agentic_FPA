import { join } from 'node:path';
import { loadTables } from '@fpa/db';
import type { Db } from '@fpa/db';
import { readFixtures } from '@fpa/db/node';
import { createTestDb } from '@fpa/db/testing';

let cached: Promise<{ db: Db; close: () => Promise<void> }> | undefined;

/** One in-process Postgres per test file, loaded with the committed synthetic fixtures. */
export function testDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  cached ??= (async () => {
    const t = await createTestDb();
    await loadTables(t.db, readFixtures(join(__dirname, '..', '..', '..', 'data')));
    return t;
  })();
  return cached;
}

/** Text a person would see: scripts and tags removed. */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
}
