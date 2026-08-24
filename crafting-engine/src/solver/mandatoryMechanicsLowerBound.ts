import type { SolverContext } from '../domain/CraftAction.ts';
import { getAllAffixes, type ItemState } from '../domain/ItemState.ts';
import {
  getAllTargetModRequirements,
  matchesModRequirement,
  type TargetDefinition,
} from '../domain/TargetDefinition.ts';
import type {
  CraftMechanic,
  MechanicStateCreation,
  MechanicsConfidence,
} from '../rules/actionRegistry.ts';

export interface MandatoryMechanicsLowerBoundComponent {
  id: 'CREATE_REQUIRED_FRACTURED_AFFIX';
  requiredState: MechanicStateCreation;
  minimumApplications: 1;
  eligibleActionIds: string[];
  selectedMinimumActionId: string;
  selectedMinimumActionName: string;
  lowerBoundChaos: number;
  mechanicsConfidence: MechanicsConfidence;
  priceConfidence: ReturnType<CraftMechanic['getCost']>['confidence'];
  provenance: string;
}

export interface MandatoryMechanicsLowerBoundResult {
  proven: boolean;
  lowerBoundChaos: number;
  components: MandatoryMechanicsLowerBoundComponent[];
  enabledActionIds: string[];
  unavailableActionIds: string[];
  provenance: string;
}

/**
 * Proves costs every terminal path must pay from the supplied state.
 * This uses only target predicates and shared registry capabilities: no retry
 * expectation, selected policy, target name, or fixture identity participates.
 */
export function evaluateMandatoryMechanicsLowerBound(
  context: SolverContext,
  state: ItemState,
  target: TargetDefinition,
  mechanics: readonly CraftMechanic[],
  enabledActionIds: readonly string[],
  allowResearchFallbackPrices: boolean
): MandatoryMechanicsLowerBoundResult {
  const enabled = new Set(enabledActionIds);
  const scopedMechanics = mechanics.filter((mechanic) => enabled.has(mechanic.id));
  const unavailableActionIds = [...enabled].filter(
    (actionId) => !scopedMechanics.some((mechanic) => mechanic.id === actionId)
  );
  const requiredFractureAbsent = getAllTargetModRequirements(target).some(
    (requirement) => requirement.mustBeFractured === true &&
      !getAllAffixes(state).some(
        (mod) => mod.isFractured && matchesModRequirement(mod, requirement)
      )
  );
  if (!requiredFractureAbsent) {
    return {
      proven: true,
      lowerBoundChaos: 0,
      components: [],
      enabledActionIds: [...enabled].sort(),
      unavailableActionIds,
      provenance: 'No absent mandatory state creation was identified from the target contract.',
    };
  }

  const creators = scopedMechanics
    .filter((mechanic) => mechanic.createsState?.includes('FRACTURED_AFFIX'))
    .map((mechanic) => ({ mechanic, cost: mechanic.getCost(context) }));
  const unusableCreators = creators.filter(({ cost }) =>
    !(
      Number.isFinite(cost.costChaos) &&
      cost.costChaos >= 0 &&
      (allowResearchFallbackPrices || cost.confidence !== 'research-fallback')
    ) || cost.confidence === 'unavailable'
  );
  if (unavailableActionIds.length > 0 || unusableCreators.length > 0) {
    return {
      proven: false,
      lowerBoundChaos: 0,
      components: [],
      enabledActionIds: [...enabled].sort(),
      unavailableActionIds,
      provenance:
        'The target requires creation of a fractured affix, but the enabled action scope has ' +
        'unknown capabilities or a fracture creator without usable price evidence. The true ' +
        'minimum action cost is not established, so no positive mechanics bound applied.',
    };
  }
  const pricedCreators = creators
    .sort((left, right) => left.cost.costChaos - right.cost.costChaos);
  const minimum = pricedCreators[0];
  if (!minimum) {
    return {
      proven: false,
      lowerBoundChaos: 0,
      components: [],
      enabledActionIds: [...enabled].sort(),
      unavailableActionIds,
      provenance:
        'The target requires creation of a fractured affix, but no enabled registry mechanic ' +
        'with usable price evidence declares that capability; no positive mechanics bound applied.',
    };
  }

  return {
    proven: true,
    lowerBoundChaos: minimum.cost.costChaos,
    components: [{
      id: 'CREATE_REQUIRED_FRACTURED_AFFIX',
      requiredState: 'FRACTURED_AFFIX',
      minimumApplications: 1,
      eligibleActionIds: pricedCreators.map(({ mechanic }) => mechanic.id),
      selectedMinimumActionId: minimum.mechanic.id,
      selectedMinimumActionName: minimum.mechanic.name,
      lowerBoundChaos: minimum.cost.costChaos,
      mechanicsConfidence: minimum.mechanic.mechanicsConfidence ?? 'VALIDATED',
      priceConfidence: minimum.cost.confidence,
      provenance:
        'The target requires a fractured affix absent from the initial state. At least one enabled ' +
        `fracture-creating action is unavoidable; ${minimum.mechanic.name} is the cheapest declared ` +
        'capability. This is one mandatory application, not an expected retry count.',
    }],
    enabledActionIds: [...enabled].sort(),
    unavailableActionIds,
    provenance:
      'Mechanics-required cost derived from target predicates and shared action-registry ' +
      'state-creation capabilities.',
  };
}
