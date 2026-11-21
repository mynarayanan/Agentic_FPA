import { ForecastView } from '../../components/ForecastView';
import { ErrorNotice, SetupNotice } from '../../components/ui';
import { getDb } from '../../lib/db';
import { loadForecast } from '../../lib/loaders';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const db = getDb();
  if (!db) return <SetupNotice />;
  try {
    return <ForecastView data={await loadForecast(db)} />;
  } catch (e) {
    console.error('forecast failed', e);
    return (
      <ErrorNotice message="This screen could not be loaded. Check that the database has been migrated and loaded." />
    );
  }
}
