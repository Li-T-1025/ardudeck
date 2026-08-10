/**
 * GitHub sync indicator for surfaces whose data the Fleet Vault covers
 * (parameters, missions, areas). Shows backup state; clicking always leads
 * to the Vault view, where setup and sync live.
 */
import { Github } from 'lucide-react';
import { useEffect } from 'react';
import { useFleetRepoStore } from '../../stores/fleet-repo-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useCargoEnabled, VAULT_CARGO_SLUG } from '../../modules/capabilities';

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

interface VaultSyncBadgeProps {
  /**
   * 'icon' = compact toolbar chip (mission toolbar, area editor).
   * 'button' = full-size labelled button matching header action rows
   * (parameters header next to Refresh/Reboot).
   */
  variant?: 'icon' | 'button';
}

export function VaultSyncBadge({ variant = 'icon' }: VaultSyncBadgeProps) {
  const status = useFleetRepoStore((s) => s.status);
  const refresh = useFleetRepoStore((s) => s.refresh);
  const setView = useNavigationStore((s) => s.setView);
  const vaultEnabled = useCargoEnabled(VAULT_CARGO_SLUG);

  useEffect(() => {
    if (vaultEnabled && !status) refresh();
  }, [vaultEnabled, status, refresh]);

  if (!vaultEnabled) return null;

  const connected = (status?.github.connected ?? false) && Boolean(status?.github.repo);
  const lastSyncAt = status?.github.lastSyncAt;

  const tip = connected
    ? lastSyncAt
      ? `Backed up to GitHub, synced ${timeAgo(lastSyncAt)}. Click to open the vault.`
      : 'GitHub connected, not synced yet. Click to open the vault.'
    : 'Not backed up. Click to set up GitHub backup in the vault.';

  // Navigate the local window's view directly (works in the main window even
  // with a stale preload) AND ask main to focus + navigate the main window,
  // which is what does the job from secondary windows like the area editor.
  const openVault = () => {
    setView('vault');
    window.electronAPI?.navOpenView?.('vault');
  };

  if (variant === 'button') {
    return (
      <button
        onClick={openVault}
        title={tip}
        className="px-4 py-2 text-sm rounded-lg flex items-center gap-2 bg-surface-raised hover:bg-surface text-content border border-subtle"
      >
        <Github className={`w-4 h-4 ${connected ? 'text-emerald-500' : 'text-content-secondary'}`} />
        Backup
      </button>
    );
  }

  return (
    <button
      onClick={openVault}
      title={tip}
      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
        connected
          ? 'text-emerald-500 hover:bg-surface-raised'
          : 'text-content-tertiary hover:text-content hover:bg-surface-raised'
      }`}
    >
      <Github className="w-4 h-4" />
    </button>
  );
}
