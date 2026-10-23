export const MINIMUM_PERSONNEL_TEMPLATE_ID = 'tmpl-02-minimum-personnel';

export interface RuleConditionNode {
  metric?: string;
  operator?: string;
  value?: any;
  logical?: 'AND' | 'OR' | 'NOT';
  conditions?: RuleConditionNode[];
}

function leaves(condition: RuleConditionNode): RuleConditionNode[] {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return [];
  return typeof condition.metric === 'string' ? [condition] : (Array.isArray(condition.conditions) ? condition.conditions : []).flatMap(leaves);
}

/** Edit the count threshold, while retaining operation gates and other clauses. */
export function editableRuleCondition(condition: RuleConditionNode): RuleConditionNode {
  const candidates = leaves(condition);
  return candidates.find(node => node.metric === 'staff_count')
    ?? candidates.find(node => node.metric === 'person_count')
    ?? candidates.find(node => typeof node.value === 'number')
    ?? candidates[0] ?? {};
}

export function updateRuleCondition(source: RuleConditionNode | undefined, edited: RuleConditionNode): RuleConditionNode {
  if (!source?.conditions?.length) return { ...source, ...edited };
  const target = editableRuleCondition(source);
  const update = (node: RuleConditionNode): RuleConditionNode => node === target
    ? { ...node, ...edited }
    : { ...node, ...(node.conditions ? { conditions: node.conditions.map(update) } : {}) };
  return update(source);
}

function mandatory(condition: RuleConditionNode, predicate: (node: RuleConditionNode) => boolean): boolean {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return false;
  if (condition.metric) return predicate(condition);
  if (!Array.isArray(condition.conditions) || !condition.conditions.length) return false;
  if (condition.logical === 'OR') return condition.conditions.every(node => mandatory(node, predicate));
  if (condition.logical === 'NOT') return false;
  if (condition.logical && condition.logical !== 'AND') return false;
  return condition.conditions.some(node => mandatory(node, predicate));
}

export function minimumPersonnelTelemetryReady(condition: RuleConditionNode, metrics: Record<string, unknown>): boolean {
  if (metrics.vault_operation_active === false) return true;
  if (metrics.vault_operation_active !== true) return false;
  const counts = leaves(condition).filter(node => ['person_count', 'staff_count'].includes(node.metric ?? ''));
  return counts.length > 0 && counts.every(node => {
    const value = metrics[node.metric!];
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  });
}

export function validMinimumPersonnelCondition(condition: RuleConditionNode): boolean {
  return mandatory(condition, node => node.metric === 'vault_operation_active' && node.operator === 'EQUALS' && node.value === true)
    && mandatory(condition, node => ['person_count', 'staff_count'].includes(node.metric ?? '')
      && node.operator === 'LESS_THAN' && Number.isInteger(node.value) && node.value >= 2);
}

/** Recover the original template guard when an older editor flattened the rule. */
export function minimumPersonnelBuilderCondition(condition: RuleConditionNode): RuleConditionNode {
  if (validMinimumPersonnelCondition(condition)) return condition;
  const count = leaves(condition).find(node => ['person_count', 'staff_count'].includes(node.metric ?? '')
    && node.operator === 'LESS_THAN' && Number.isInteger(node.value) && node.value >= 2);
  return { logical: 'AND', conditions: [
    { metric: 'vault_operation_active', operator: 'EQUALS', value: true },
    count ?? { metric: 'person_count', operator: 'LESS_THAN', value: 2 },
  ] };
}

export function describeRuleCondition(condition: RuleConditionNode): string {
  if (!condition || typeof condition !== 'object') return 'Invalid condition';
  if (condition.metric) {
    const operators: Record<string, string> = { EQUALS: '=', NOT_EQUALS: '≠', LESS_THAN: '<', LESS_THAN_OR_EQUAL: '≤', GREATER_THAN: '>', GREATER_THAN_OR_EQUAL: '≥' };
    return `${condition.metric.replaceAll('_', ' ')} ${operators[condition.operator ?? ''] ?? condition.operator?.replaceAll('_', ' ') ?? ''} ${String(condition.value ?? '')}`;
  }
  const clauses = Array.isArray(condition.conditions) ? condition.conditions.map(describeRuleCondition) : [];
  if (!clauses.length) return 'No condition configured';
  return condition.logical === 'NOT' ? `NOT (${clauses.join(' OR ')})` : `(${clauses.join(` ${condition.logical ?? 'AND'} `)})`;
}
