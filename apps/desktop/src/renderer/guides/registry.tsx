import { GroupingDemo } from './GroupingDemo';
import { LayoutsDemo } from './LayoutsDemo';
import { SplitDemo } from './SplitDemo';
import { AdjustDemo, CargoDemo, CrsfDemo, LanguageDemo, SitlDemo } from './ReleaseDemos';

export interface AppGuide {
  /** Versioned id; bump the suffix to show a changed guide again. Shared with the mobile app where both have it. */
  id: string;
  titleKey: string;
  blurbKey: string;
  Demo: () => JSX.Element;
}

/** Newest first. The launch run shows unseen guides oldest first, the order they build on each other. */
export const APP_GUIDES: AppGuide[] = [
  { id: 'language-v1', titleKey: 'guides:registry.language.title', blurbKey: 'guides:registry.language.blurb', Demo: LanguageDemo },
  { id: 'in-flight-adjust-v1', titleKey: 'guides:registry.adjust.title', blurbKey: 'guides:registry.adjust.blurb', Demo: AdjustDemo },
  { id: 'cargo-manager-v1', titleKey: 'guides:registry.cargo.title', blurbKey: 'guides:registry.cargo.blurb', Demo: CargoDemo },
  { id: 'crsf-backpack-v1', titleKey: 'guides:registry.crsf.title', blurbKey: 'guides:registry.crsf.blurb', Demo: CrsfDemo },
  { id: 'sitl-launch-v1', titleKey: 'guides:registry.sitl.title', blurbKey: 'guides:registry.sitl.blurb', Demo: SitlDemo },
  {
    id: 'map-split-v1',
    titleKey: 'guides:registry.mapSplit.title',
    blurbKey: 'guides:registry.mapSplit.blurb',
    Demo: SplitDemo,
  },
  {
    id: 'workspace-layouts-v1',
    titleKey: 'guides:registry.workspaceLayouts.title',
    blurbKey: 'guides:registry.workspaceLayouts.blurb',
    Demo: LayoutsDemo,
  },
  {
    id: 'grouping-v1',
    titleKey: 'guides:registry.grouping.title',
    blurbKey: 'guides:registry.grouping.blurb',
    Demo: GroupingDemo,
  },
];

export function getGuide(id: string): AppGuide | undefined {
  return APP_GUIDES.find((g) => g.id === id);
}
