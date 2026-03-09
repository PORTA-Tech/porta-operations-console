import { Panel } from '../../components/Layout/Panel';
import {
  healthToneClass,
  healthToneLabel,
  OperationsPageLayout,
  StatusField,
  truthToneClass
} from '../../components/Operations/OperationsPageSupport';

export function SystemHealthPage() {
  return (
    <OperationsPageLayout
      pageTitle="System Health"
      emptyMessage="No current machine snapshot is available."
    >
      {(record) => (
        <Panel title="System Health">
          <div className="operations-layer-grid">
            <StatusField label="Status" value={healthToneLabel(record.healthTone)} className={healthToneClass(record.healthTone)} />
            <StatusField label="Machine name" value={record.layer1.machineName} />
            <StatusField label="User name" value={record.layer1.userName} />
            <StatusField label="Last seen time" value={record.layer1.lastSeenAtUtc ? new Date(record.layer1.lastSeenAtUtc).toLocaleString() : 'No recent data'} />
            <StatusField label="Agent running" value={record.layer1.agentRunning} className={truthToneClass(record.layer1.agentRunning)} />
            <StatusField label="User session connected" value={record.layer1.userSessionConnected} className={truthToneClass(record.layer1.userSessionConnected)} />
            <StatusField label="Activity detected" value={record.layer1.activityDetected} className={truthToneClass(record.layer1.activityDetected)} />
            <StatusField label="Last activity time" value={record.layer1.lastActivityAtUtc ? new Date(record.layer1.lastActivityAtUtc).toLocaleString() : 'No recent data'} />
            <StatusField label="Error message" value={record.layer1.errorMessage ?? 'None'} />
          </div>
        </Panel>
      )}
    </OperationsPageLayout>
  );
}
