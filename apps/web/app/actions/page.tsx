import { ActionsView } from '../../components/ActionsView';
import { ErrorNotice, SetupNotice } from '../../components/ui';
import { getDb } from '../../lib/db';
import { loadActions } from '../../lib/loaders';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const db = getDb();
  if (!db) return <SetupNotice />;
  try {
    const q = await searchParams;
    return <ActionsView data={await loadActions(db, q.period)} />;
  } catch (e) {
    console.error('actions failed', e);
    return (
      <ErrorNotice message="This screen could not be loaded. Check that the database has been migrated and loaded." />
    );
  }
}
