import {
  ChartGanttIcon,
  CircleDotIcon,
  ImagesIcon,
  ListIcon,
  NetworkIcon,
  UsersRoundIcon,
  type LucideIcon,
} from 'lucide-react';

import type { ViewKind } from '@/lib/domain/types';

export const VIEW_ICONS: Record<ViewKind, LucideIcon> = {
  tree: NetworkIcon,
  family: UsersRoundIcon,
  circle: CircleDotIcon,
  list: ListIcon,
  album: ImagesIcon,
  timeline: ChartGanttIcon,
};

/** The mobile bottom bar shows these; the rest go under "More" (VIS-01). */
export const PRIMARY_VIEWS: readonly ViewKind[] = ['tree', 'family', 'circle', 'list'];
