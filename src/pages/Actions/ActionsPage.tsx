import { Panel } from '../../components/Layout/Panel';
import {
  ActionsTable,
  OperationsPageLayout
} from '../../components/Operations/OperationsPageSupport';

export function ActionsPage() {
  return (
    <OperationsPageLayout
      pageTitle="Actions"
      emptyMessage="No meaningful actions reported."
      dimWhenUnhealthy
    >
      {(record) => (
        <Panel title="Actions">
          <ActionsTable actions={record.actions} />
        </Panel>
      )}
    </OperationsPageLayout>
  );
}
