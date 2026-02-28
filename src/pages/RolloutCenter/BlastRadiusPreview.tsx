import { Panel } from '../../components/Layout/Panel';
import type { ApiError } from '../../api/client';
import type { RolloutEvaluation } from '../../api/rollout';

interface BlastRadiusPreviewProps {
  data: RolloutEvaluation | undefined;
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
          <p>Blast radius (node count): <strong>{data.blast_radius.node_count ?? 'n/a'}</strong></p>
          <p>Cohorts impacted:</p>
          <ul>
            {data.blast_radius.impacted_cohorts.map((cohort) => (
              <li key={cohort}>{cohort}</li>
            ))}
          </ul>
          {data.blast_radius.availability_reason_code ? (
            <p className="muted-line">Blast radius unavailable: {data.blast_radius.availability_reason_code}</p>
          ) : null}
          <p>Confidence: <strong>{data.blast_radius.confidence}</strong></p>
          <p>Generated at: <strong>{new Date(data.blast_radius.generated_at_utc).toLocaleString()}</strong></p>
        </>
      ) : null}
    </Panel>
  );
}

