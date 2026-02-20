import { useNodeDrilldown } from '../../hooks/useNodeDrilldown';
import { Panel } from '../../components/Layout/Panel';

export function NodeList() {
  const { nodes } = useNodeDrilldown();

  return (
    <Panel title="Node List">
      <table className="simple-table">
        <thead>
          <tr>
            <th>Node ID</th>
            <th>Cohort</th>
            <th>Config Seq</th>
            <th>SLO</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.nodeId}>
              <td>{node.nodeId.slice(0, 8)}...</td>
              <td>{node.cohortId}</td>
              <td>{node.configSeq}</td>
              <td>{node.sloCompliant ? 'Compliant' : 'Breach'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

