import { useConfigAudit } from '../../hooks/useConfigAudit';
import { Panel } from '../../components/Layout/Panel';
import { shortHash } from '../../utils/crypto';

export function ConfigDiffViewer() {
  const { rows } = useConfigAudit();
  const latest = rows.at(-1);

  return (
    <Panel title="Config Integrity">
      <p>Active Seq: <strong>{latest?.configSeq ?? 'n/a'}</strong></p>
      <p>Version: <strong>{latest?.configVersion ?? 'n/a'}</strong></p>
      <p>Hash: <strong>{shortHash(latest?.hash)}</strong></p>
      <p>Previous: <strong>{shortHash(latest?.previousHash)}</strong></p>
    </Panel>
  );
}

