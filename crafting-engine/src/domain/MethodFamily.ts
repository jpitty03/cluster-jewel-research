import type { CraftPlanSummary } from '../service/craftPlan.ts';
import type { RouteSummary } from '../service/optimizerService.ts';

export type MethodFamilyKind =
  | 'OPEN'
  | 'CONVENTIONAL'
  | 'HARVEST'
  | 'SELF_FRACTURE'
  | 'SELF_FRACTURE_HARVEST'
  | 'CHAOS_REFORGE';

export type MethodFamilyStatus =
  | 'SELECTED_WINNER'
  | 'MORE_EXPENSIVE'
  | 'DOMINATED'
  | 'NOT_ELIGIBLE'
  | 'UNRESOLVED_AT_BUDGET'
  | 'DISABLED'
  | 'NOT_MODELED';

export interface MethodFamilySpec {
  id: string;
  kind: MethodFamilyKind;
  name: string;
  description: string;
  badge: string;
  allowedActionIds?: string[] | null;
  requiredActionIds?: string[] | null;
  forcedAcquisitionType?: 'CLEAN' | 'SELF_FRACTURE' | 'OPEN';
  targetFractureModId?: string;
  targetFractureModName?: string;
}

export interface MethodFamilyResult {
  spec: MethodFamilySpec;
  status: MethodFamilyStatus;
  route?: RouteSummary;
  craftPlan?: CraftPlanSummary;
  costDifferenceChaos?: number;
  costDifferencePercent?: number;
  actionsSaved?: number;
  timeSavedMs?: number;
  whyNotSelectedExplanation?: string;
}
