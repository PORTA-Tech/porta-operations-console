import { Panel } from '../../components/Layout/Panel';
import {
  formatDuration,
  OperationsPageLayout,
  riskToneClass,
  StatusField,
  truthToneClass
} from '../../components/Operations/OperationsPageSupport';

export function UserActivityPage() {
  return (
    <OperationsPageLayout
      pageTitle="User Activity"
      emptyMessage="User Activity is unavailable until System Health is reporting."
      dimWhenUnhealthy
    >
      {(record) => (
        <Panel title="User Activity">
          <div className="operations-layer-grid compact">
            <StatusField label="Focus level" value={record.layer2.focusLevel} className={riskToneClass(record.layer2.focusLevel)} />
            <StatusField
              label="Deep work"
              value={record.layer2.deepWork}
              className={record.layer2.deepWork === 'Active' ? 'status-badge ok' : 'status-badge warn'}
            />
            <StatusField label="Overload risk" value={record.layer2.overloadRisk} className={riskToneClass(record.layer2.overloadRisk)} />
            <StatusField label="Focus duration" value={formatDuration(record.layer2.focusDurationSec)} />
            <StatusField label="Break needed" value={record.layer2.breakNeeded} className={truthToneClass(record.layer2.breakNeeded)} />
          </div>
        </Panel>
      )}
    </OperationsPageLayout>
  );
}
