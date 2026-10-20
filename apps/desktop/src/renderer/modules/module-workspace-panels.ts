// Workspace (dockview) panels contributed by cargo: they join the Add panel grid and saved layouts.
import type { ComponentType } from 'react';
import { create } from 'zustand';
import type { WorkspacePanelRegistration } from '@ardudeck/module-sdk';

/** The one dockview component every cargo panel is mounted through; the cargo panel id rides in the params. */
export const MODULE_WORKSPACE_COMPONENT = 'ModuleWorkspacePanel';

export interface ModuleWorkspacePanel {
  /** `slug/id`, unique across cargos and stable in saved layouts. */
  id: string;
  slug: string;
  title: () => string;
  Icon?: ComponentType<{ className?: string }>;
  Component: ComponentType;
}

export function moduleWorkspacePanelId(slug: string, id: string): string {
  return `${slug}/${id}`;
}

interface State {
  panels: ModuleWorkspacePanel[];
}

export const useModuleWorkspacePanelsStore = create<State>(() => ({ panels: [] }));

export function registerModuleWorkspacePanel(slug: string, reg: WorkspacePanelRegistration): void {
  if (!reg?.id || typeof reg.title !== 'function' || typeof reg.component !== 'function') {
    throw new Error(`[module:${slug}] workspace panel needs an id, a title() and a component`);
  }
  const id = moduleWorkspacePanelId(slug, reg.id);
  useModuleWorkspacePanelsStore.setState((s) => ({
    panels: [...s.panels.filter((p) => p.id !== id), { id, slug, title: reg.title, Icon: reg.icon, Component: reg.component }],
  }));
}

export function unregisterModuleWorkspacePanel(slug: string, id: string): void {
  const full = moduleWorkspacePanelId(slug, id);
  useModuleWorkspacePanelsStore.setState((s) => ({ panels: s.panels.filter((p) => p.id !== full) }));
}

export function unregisterModuleWorkspacePanelsForSlug(slug: string): void {
  useModuleWorkspacePanelsStore.setState((s) => ({ panels: s.panels.filter((p) => p.slug !== slug) }));
}
