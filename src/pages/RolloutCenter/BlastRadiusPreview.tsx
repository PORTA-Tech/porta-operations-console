import { Panel } from '../../components/Layout/Panel';
import type { ApiError } from '../../api/client';
import type { RolloutDryRunView } from '../../api/rollout';

interface BlastRadiusPreviewProps {
  data: RolloutDryRunView | undefined;
  loading: boolean;
  error: ApiError | undefined;
}

export function BlastRadiusPreview({ data, loading, error }: BlastRadiusPreviewProps) {
  return (
    <Panel title="Blast Radius Preview">
      {loading ? <p className="muted-line">Loading dry-run preview...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {data ? (
        <>
          <p>Blast radius (node count): <strong>{data.blast_radius_node_count}</strong></p>
          <p>Cohorts impacted:</p>
          <ul>
            {data.cohorts_impacted.map((cohort) => (
              <li key={cohort}>{cohort}</li>
            ))}
          </ul>
          <p>Generated at: <strong>{new Date(data.generated_at_utc).toLocaleString()}</strong></p>
        </>
      ) : null}
    </Panel>
  );
}

