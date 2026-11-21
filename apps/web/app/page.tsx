import { CockpitView } from '../components/CockpitView';
import { ErrorNotice, SetupNotice } from '../components/ui';
import { getDb } from '../lib/db';
import { loadCockpit } from '../lib/loaders';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const db = getDb();
  if (!db) return <SetupNotice />;
  try {
    return <CockpitView data={await loadCockpit(db)} />;
  } catch (e) {
    console.error('cockpit failed', e);
    return (
      <ErrorNotice message="The cockpit could not be loaded. Check that the database has been migrated and loaded." />
    );
  }
}
