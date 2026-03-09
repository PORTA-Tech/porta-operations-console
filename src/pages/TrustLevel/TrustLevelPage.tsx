import { Panel } from '../../components/Layout/Panel';
import {
  OperationsPageLayout,
  qualityToneClass,
  riskToneClass,
  StatusField
} from '../../components/Operations/OperationsPageSupport';

export function TrustLevelPage() {
  return (
    <OperationsPageLayout
      pageTitle="Trust Level"
      emptyMessage="Trust Level is unavailable until System Health is reporting."
      dimWhenUnhealthy
    >
      {(record) => (
        <Panel title="Trust Level">
          <div className="operations-layer-grid compact">
            <StatusField
              label="Learning stage"
              value={record.layer3.learningStage}
              className={record.layer3.learningStage === 'Ready' ? 'status-badge ok' : 'status-badge warn'}
            />
            <StatusField label="Confidence" value={record.layer3.confidence} className={riskToneClass(record.layer3.confidence)} />
            <StatusField label="Data quality" value={record.layer3.dataQuality} className={qualityToneClass(record.layer3.dataQuality)} />
          </div>
        </Panel>
      )}
    </OperationsPageLayout>
  );
}
