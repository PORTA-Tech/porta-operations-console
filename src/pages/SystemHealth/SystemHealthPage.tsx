import { useEffect, useMemo, useState } from 'react';
import {
  fetchAccountDevices,
  revokeAccountDevice,
  unlinkAccountDevice,
  type AccountDeviceProfile
} from '../../api/accountDevices';
import { toApiError } from '../../api/client';
import { Panel } from '../../components/Layout/Panel';
import { SummaryBand } from '../../components/Layout/SummaryBand';
import { useSystemHealthLayer } from '../../hooks/useSystemHealthLayer';
import type { SystemHealthRecord, SystemHealthStatus } from '../../types/systemHealth';
import { formatRelativeFromNow, formatUtc } from '../../utils/date';

type DeviceSelection = {
  machineId: string;
  accountId: string;
  machineName: string;
  userName: string;
  userDetail: string | null;
  orgRole: string | null;
  deviceId: string | null;
};

function statusClass(value: SystemHealthStatus): string {
  if (value === 'Yes') return 'status-badge ok';
  if (value === 'No') return 'status-badge critical';
  return 'status-badge warn';
}

function deviceStatusClass(value: string | null | undefined): string {
  if (value === 'active') return 'status-badge ok';
  if (value === 'revoked') return 'status-badge critical';
  if (value === 'unlinked') return 'status-badge warn';
  return 'status-badge neutral';
}

function deviceStatusLabel(value: string | null | undefined): string {
  if (!value) return 'Unknown';

  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function deviceSortRank(device: AccountDeviceProfile, currentDeviceId: string | null): number {
  if (currentDeviceId && device.deviceId === currentDeviceId) return 0;
  if (device.status === 'active') return 1;
  if (device.status === 'unlinked') return 2;
  if (device.status === 'revoked') return 3;
  return 4;
}

function timeCell(valueUtc: string | null, label: string, stale: boolean) {
  const title = valueUtc ? formatUtc(valueUtc) : label;
  const className = stale ? 'system-health-time stale' : 'system-health-time';
  return (
    <span className={className} title={title}>
      {label}
    </span>
  );
}

export function SystemHealthPage() {
  const { records, loading, error, notices } = useSystemHealthLayer();
  const [selection, setSelection] = useState<DeviceSelection | null>(null);
  const [accountDevices, setAccountDevices] = useState<AccountDeviceProfile[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);
  const [pendingDeviceAction, setPendingDeviceAction] = useState<string | null>(null);
  const [deviceRefreshToken, setDeviceRefreshToken] = useState(0);

  const healthyCount = records.filter((record) => record.tone === 'healthy').length;
  const degradedCount = records.filter((record) => record.tone === 'warning').length;
  const disconnectedCount = records.filter((record) => record.agentRunning === 'No').length;
  const revokedCount = records.filter((record) => record.deviceStatus === 'revoked').length;
  const noActivityCount = records.filter(
    (record) => record.agentRunning === 'Yes' && record.userSessionConnected === 'Yes' && record.activityDetected !== 'Yes'
  ).length;
  const latestSeenUtc = records[0]?.lastSeenUtc ?? null;
  const latestActivityUtc = records
    .filter((record) => record.lastActivityUtc)
    .sort((left, right) => Date.parse(right.lastActivityUtc ?? '') - Date.parse(left.lastActivityUtc ?? ''))[0]?.lastActivityUtc ?? null;

  const selectedRecord = useMemo(
    () => (selection ? records.find((record) => record.machineId === selection.machineId) ?? null : null),
    [records, selection]
  );

  const selectedAccountId = selectedRecord?.accountId ?? selection?.accountId ?? null;
  const selectedMachineName = selectedRecord?.machineName ?? selection?.machineName ?? 'Unknown machine';
  const selectedUserName = selectedRecord?.userName ?? selection?.userName ?? 'Unknown user';
  const selectedUserDetail = selectedRecord?.userDetail ?? selection?.userDetail ?? null;
  const selectedOrgRole = selectedRecord?.orgRole ?? selection?.orgRole ?? null;
  const selectedDeviceId = selectedRecord?.deviceId ?? selection?.deviceId ?? null;
  const selectedDeviceStatus = selectedRecord?.deviceStatus ?? null;
  const selectedDeviceRevokedAt = selectedRecord?.deviceRevokedAt ?? null;

  const sortedAccountDevices = useMemo(
    () => (
      [...accountDevices].sort((left, right) => {
        const rankDelta = deviceSortRank(left, selectedDeviceId) - deviceSortRank(right, selectedDeviceId);
        if (rankDelta !== 0) {
          return rankDelta;
        }

        return Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt);
      })
    ),
    [accountDevices, selectedDeviceId]
  );

  useEffect(() => {
    setDeviceError(null);
    setDeviceNotice(null);
  }, [selection?.machineId]);

  useEffect(() => {
    if (!selectedAccountId) {
      setAccountDevices([]);
      setDeviceLoading(false);
      return;
    }

    let cancelled = false;
    setAccountDevices([]);
    setDeviceLoading(true);
    setDeviceError(null);

    void fetchAccountDevices(selectedAccountId)
      .then((devices) => {
        if (cancelled) return;
        setAccountDevices(devices);
      })
      .catch((nextError: unknown) => {
        if (cancelled) return;
        setAccountDevices([]);
        setDeviceError(toApiError(nextError).message);
      })
      .finally(() => {
        if (cancelled) return;
        setDeviceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deviceRefreshToken, selectedAccountId]);

  async function handleDeviceAction(device: AccountDeviceProfile, action: 'unlink' | 'revoke') {
    if (!selectedAccountId) {
      return;
    }

    const deviceLabel = device.deviceDisplayName || device.machineName || device.deviceId;
    const confirmed = window.confirm(
      action === 'revoke'
        ? `Revoke ${deviceLabel}? This device will stop being treated as an active account-linked device.`
        : `Unlink ${deviceLabel}? This removes the device from the selected account.`
    );
    if (!confirmed) {
      return;
    }

    const actionKey = `${action}:${device.deviceId}`;
    setPendingDeviceAction(actionKey);
    setDeviceError(null);
    setDeviceNotice(null);

    try {
      if (action === 'revoke') {
        await revokeAccountDevice(selectedAccountId, device.deviceId);
        setDeviceNotice(`Device revoked centrally: ${deviceLabel}.`);
      } else {
        await unlinkAccountDevice(selectedAccountId, device.deviceId);
        setDeviceNotice(`Device unlinked centrally: ${deviceLabel}.`);
      }

      setDeviceRefreshToken((value) => value + 1);
    } catch (nextError) {
      setDeviceError(toApiError(nextError).message);
    } finally {
      setPendingDeviceAction(null);
    }
  }

  function selectDeviceManager(record: SystemHealthRecord) {
    if (!record.accountId) {
      return;
    }

    setSelection({
      machineId: record.machineId,
      accountId: record.accountId,
      machineName: record.machineName,
      userName: record.userName,
      userDetail: record.userDetail,
      orgRole: record.orgRole,
      deviceId: record.deviceId
    });
  }

  return (
    <div className="stack">
      {loading ? <p className="muted-line">Loading system health truth...</p> : null}
      {error ? <p className="error-line">{error.code}: {error.message}</p> : null}
      {notices.map((notice) => (
        <div key={notice} className="operations-warning-banner">
          {notice}
        </div>
      ))}
      <SummaryBand
        title="Fleet health"
        subtitle="Immediate operational truth for runtime, session, activity ingest health, and whether account-linked devices are still active."
        items={[
          {
            label: 'Healthy machines',
            value: String(healthyCount),
            meta: latestSeenUtc ? `Last seen ${formatRelativeFromNow(latestSeenUtc)}` : (healthyCount === 1 ? 'Machine fully reporting' : 'Machines fully reporting'),
            tone: 'ok'
          },
          {
            label: 'Degraded capture',
            value: String(degradedCount),
            meta: degradedCount === 1 ? 'Machine needs attention' : 'Machines need attention',
            tone: degradedCount > 0 ? 'warn' : 'neutral'
          },
          {
            label: 'Disconnected agents',
            value: String(disconnectedCount),
            meta: disconnectedCount === 1 ? 'Agent offline' : 'Agents offline',
            tone: disconnectedCount > 0 ? 'critical' : 'neutral'
          },
          {
            label: 'Revoked devices',
            value: String(revokedCount),
            meta: revokedCount === 1 ? 'Machine no longer active for account link' : 'Machines no longer active for account link',
            tone: revokedCount > 0 ? 'critical' : 'neutral'
          },
          {
            label: 'No live activity',
            value: String(noActivityCount),
            meta: latestActivityUtc ? `Last activity ${formatRelativeFromNow(latestActivityUtc)}` : (noActivityCount === 1 ? 'Session quiet or stalled' : 'Sessions quiet or stalled'),
            tone: noActivityCount > 0 ? 'warn' : 'neutral'
          }
        ]}
      />
      <Panel
        title="Machine detail"
        subtitle="Supporting runtime, session, activity, and current device-link state beneath the live fleet health summary."
      >
        {records.length === 0 ? (
          <div className="empty-state">
            <p className="muted-line">
              No machine health rows are available. System Health cannot render operational truth until the backend supplies machine, session, activity, and device state to the console.
            </p>
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table className="simple-table system-health-table">
              <thead>
                <tr>
                  <th>Machine name</th>
                  <th>User name</th>
                  <th>Device status</th>
                  <th>Last seen time</th>
                  <th>Agent running</th>
                  <th>User session connected</th>
                  <th>Activity detected</th>
                  <th>Last activity time</th>
                  <th>Error message</th>
                  <th>Device admin</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.machineId} className="system-health-row" data-tone={record.tone}>
                    <td title={record.machineId}>{record.machineName}</td>
                    <td>
                      <div className="identity-stack">
                        <strong>{record.userName}</strong>
                        {record.userDetail ? <span className="identity-subline">{record.userDetail}</span> : null}
                        {record.orgRole ? <span className="identity-tertiary">{record.orgRole}</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="identity-stack">
                        <span className={deviceStatusClass(record.deviceStatus)}>{deviceStatusLabel(record.deviceStatus)}</span>
                        {record.deviceRevokedAt ? (
                          <span className="identity-subline">Revoked {formatRelativeFromNow(record.deviceRevokedAt)}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>{timeCell(record.lastSeenUtc, record.lastSeenLabel, record.lastSeenStale)}</td>
                    <td>
                      <span className={statusClass(record.agentRunning)}>{record.agentRunning}</span>
                    </td>
                    <td>
                      <span className={statusClass(record.userSessionConnected)}>{record.userSessionConnected}</span>
                    </td>
                    <td>
                      <span className={statusClass(record.activityDetected)}>{record.activityDetected}</span>
                    </td>
                    <td>{timeCell(record.lastActivityUtc, record.lastActivityLabel, record.lastActivityStale)}</td>
                    <td>{record.errorMessage ?? ''}</td>
                    <td>
                      {record.accountId ? (
                        <button
                          type="button"
                          className="context-action-button"
                          onClick={() => selectDeviceManager(record)}
                        >
                          Manage devices
                        </button>
                      ) : (
                        <span className="device-admin-note">Unlinked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel
        title="Device management"
        subtitle="Central account device list for a selected machine row. Revoking or unlinking here changes which devices remain active account-linked devices."
      >
        {!selection || !selectedAccountId ? (
          <div className="empty-state">
            <p className="muted-line">
              Select Manage devices on a linked machine row to inspect the account device list and centrally revoke or unlink devices.
            </p>
          </div>
        ) : (
          <div className="stack">
            <div className="operations-summary-bar device-management-summary">
              <div className="identity-stack">
                <strong>{selectedUserName}</strong>
                {selectedUserDetail ? <span className="identity-subline">{selectedUserDetail}</span> : null}
                {selectedOrgRole ? <span className="identity-tertiary">{selectedOrgRole}</span> : null}
              </div>
              <div className="device-management-meta">
                <span>Machine: {selectedMachineName}</span>
                <span>Device ID: {selectedDeviceId ?? 'Unavailable'}</span>
                <span className={deviceStatusClass(selectedDeviceStatus)}>
                  Current status: {deviceStatusLabel(selectedDeviceStatus)}
                </span>
                {selectedDeviceRevokedAt ? <span>Revoked {formatRelativeFromNow(selectedDeviceRevokedAt)}</span> : null}
              </div>
              <div className="context-actions">
                <button type="button" className="context-action-button" onClick={() => setDeviceRefreshToken((value) => value + 1)}>
                  Refresh devices
                </button>
                <button type="button" className="context-action-button" onClick={() => setSelection(null)}>
                  Close
                </button>
              </div>
            </div>

            {deviceNotice ? <p className="device-success-line">{deviceNotice}</p> : null}
            {deviceError ? <p className="error-line">{deviceError}</p> : null}
            {deviceLoading ? <p className="muted-line">Loading account devices...</p> : null}

            {sortedAccountDevices.length === 0 && !deviceLoading ? (
              <div className="empty-state">
                <p className="muted-line">
                  No devices are currently linked to this account. If the selected machine was unlinked, it will disappear from the account device list immediately.
                </p>
              </div>
            ) : null}

            {sortedAccountDevices.length > 0 ? (
              <div className="table-scroll-wrap table-scroll-wrap-secondary">
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Status</th>
                      <th>Last seen</th>
                      <th>Workspace</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAccountDevices.map((device) => {
                      const isCurrentDevice = selectedDeviceId === device.deviceId;
                      const busyKey = pendingDeviceAction;
                      const unlinkBusy = busyKey === `unlink:${device.deviceId}`;
                      const revokeBusy = busyKey === `revoke:${device.deviceId}`;

                      return (
                        <tr key={device.deviceId}>
                          <td>
                            <div className="identity-stack">
                              <strong>{isCurrentDevice ? `${device.deviceDisplayName} (Current machine)` : device.deviceDisplayName}</strong>
                              <span className="identity-subline">
                                {device.machineName} / {deviceStatusLabel(device.platform)} / {device.agentVersion}
                              </span>
                              <span className="identity-tertiary">{device.deviceId}</span>
                            </div>
                          </td>
                          <td>
                            <div className="identity-stack">
                              <span className={deviceStatusClass(device.status)}>{deviceStatusLabel(device.status)}</span>
                              {device.revokedAt ? <span className="identity-subline">Revoked {formatRelativeFromNow(device.revokedAt)}</span> : null}
                            </div>
                          </td>
                          <td title={formatUtc(device.lastSeenAt)}>
                            <div className="identity-stack">
                              <strong>{formatRelativeFromNow(device.lastSeenAt)}</strong>
                              <span className="identity-subline">{formatUtc(device.lastSeenAt)}</span>
                            </div>
                          </td>
                          <td>{device.orgId ?? 'Unlinked'}</td>
                          <td>
                            <div className="device-action-row">
                              <button
                                type="button"
                                className="context-action-button"
                                disabled={!device.currentAccountId || unlinkBusy || revokeBusy}
                                onClick={() => void handleDeviceAction(device, 'unlink')}
                              >
                                {unlinkBusy ? 'Unlinking...' : 'Unlink'}
                              </button>
                              <button
                                type="button"
                                className="context-action-button danger"
                                disabled={device.status === 'revoked' || unlinkBusy || revokeBusy}
                                onClick={() => void handleDeviceAction(device, 'revoke')}
                              >
                                {revokeBusy ? 'Revoking...' : 'Revoke'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )}
      </Panel>
    </div>
  );
}
