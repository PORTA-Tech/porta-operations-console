import { Panel } from '../../components/Layout/Panel';
import { SummaryBand } from '../../components/Layout/SummaryBand';
import { useTrustLevelLayer } from '../../hooks/useTrustLevelLayer';
import type { TrustConfidence, TrustDataQuality, TrustLearningStage } from '../../types/trustLevel';

function learningStageBadgeClass(value: TrustLearningStage): string {
  return value === 'Ready' ? 'status-badge ok' : 'status-badge warn';
}

function confidenceBadgeClass(value: TrustConfidence): string {
  if (value === 'High') return 'status-badge ok';
  if (value === 'Medium') return 'status-badge warn';
  return 'status-badge critical';
}

function dataQualityBadgeClass(value: TrustDataQuality): string {
  if (value === 'Good') return 'status-badge ok';
  if (value === 'Partial') return 'status-badge warn';
  return 'status-badge critical';
}

export function TrustLevelPage() {
  const { records, loading, error, notices } = useTrustLevelLayer();
  const readyCount = records.filter((record) => record.learningStage === 'Ready').length;
  const learningCount = records.filter((record) => record.learningStage === 'Learning').length;
  const confidenceHighCount = records.filter((record) => record.confidence === 'High').length;
  const limitedQualityCount = records.filter((record) => record.dataQuality !== 'Good').length;

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading trust truth...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {notices.map((notice) => (
        <div key={notice} className="operations-warning-banner">
          {notice}
        </div>
      ))}
      <SummaryBand
        title="Trust readiness"
        subtitle="How quickly the fleet is becoming safe enough for regulation and how reliable that trust is."
        items={[
          {
            label: 'Ready',
            value: String(readyCount),
            meta: readyCount === 1 ? 'Machine fully calibrated' : 'Machines fully calibrated',
            tone: readyCount > 0 ? 'ok' : 'neutral'
          },
          {
            label: 'Learning',
            value: String(learningCount),
            meta: learningCount === 1 ? 'Machine still calibrating' : 'Machines still calibrating',
            tone: learningCount > 0 ? 'warn' : 'neutral'
          },
          {
            label: 'Confidence high',
            value: String(confidenceHighCount),
            meta: confidenceHighCount === 1 ? 'Machine above high-confidence threshold' : 'Machines above high-confidence threshold',
            tone: confidenceHighCount > 0 ? 'ok' : 'neutral'
          },
          {
            label: 'Quality limited',
            value: String(limitedQualityCount),
            meta: limitedQualityCount === 1 ? 'Machine with partial or poor quality' : 'Machines with partial or poor quality',
            tone: limitedQualityCount > 0 ? 'warn' : 'neutral'
          }
        ]}
      />
      <Panel title="Trust Level">
        {records.length === 0 ? (
          <p className="muted-line">
            No trust rows are available. Trust Level cannot render calibration, confidence, or data-quality truth until the backend supplies current trust state.
          </p>
        ) : (
          <div className="table-scroll-wrap">
            <table className="simple-table trust-level-table">
              <thead>
                <tr>
                  <th>Machine / User</th>
                  <th>Learning stage</th>
                  <th>Confidence</th>
                  <th>Data quality</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.machineId} className="trust-level-row" data-tone={record.tone}>
                    <td>
                      <div className="trust-level-context">
                        <strong>{record.machineName}</strong>
                        <span className="trust-level-user">{record.userName}</span>
                      </div>
                    </td>
                    <td>
                      <span className={learningStageBadgeClass(record.learningStage)}>{record.learningStage}</span>
                    </td>
                    <td>
                      <span className={confidenceBadgeClass(record.confidence)}>{record.confidence}</span>
                    </td>
                    <td>
                      <span className={dataQualityBadgeClass(record.dataQuality)}>{record.dataQuality}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
