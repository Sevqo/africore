import {
  workflowActions,
  workflowBranchFields as sourceFields,
} from '../../../src/common/workflow-policy';
import { useEffect, useState } from 'react';
import { Field, factor } from './UI';
import { parseMoney } from '../../../src/finance/money';
export function WorkflowBranchFields({
  template,
  workflow,
  currency = 'KES',
  fallbackAction,
  onFallbackChange,
  stages = [],
  onBranchActionsChange,
  onBranchesChange,
  disabledActions = [],
}: {
  template: string;
  workflow?: any;
  currency?: string;
  fallbackAction?: string;
  onFallbackChange?: (action: string) => void;
  stages?: { id: string; name: string }[];
  onBranchActionsChange?: (actions: string[]) => void;
  onBranchesChange?: (branches: any[]) => void;
  disabledActions?: string[];
}) {
  const [branches, setBranches] = useState<any[]>(workflow?.branches || []),
    [fallback, setFallback] = useState(workflow?.fallback_action || ''),
    [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  useEffect(() => setAmountDrafts({}), [currency]);
  const actions = workflowActions(template),
    fields = sourceFields(template);
  const chosenFallback = fallbackAction ?? fallback;
  useEffect(() => {
    onBranchActionsChange?.(branches.map((branch) => branch.action));
  }, [branches, onBranchActionsChange]);
  useEffect(() => {
    onBranchesChange?.(branches);
  }, [branches, onBranchesChange]);
  function changeFallback(value: string) {
    setFallback(value);
    onFallbackChange?.(value);
  }
  function update(index: number, value: any) {
    setBranches((v) => v.map((b, i) => (i === index ? value : b)));
  }
  function move(index: number, offset: number) {
    setBranches((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  return (
    <details className="panel">
      <summary>Conditional branches and retry policy</summary>
      <p>
        Branches run in this order. All conditions in a branch must match. Actions stay within the
        selected template's supported services; no arbitrary code or financial posting is allowed.
      </p>
      {!fields.length && (
        <p>
          This trigger uses its template conditions and scheduling; no additional business fields
          are available for branches.
        </p>
      )}
      <input type="hidden" name="workflow_branches" value={JSON.stringify(branches)} />
      <div className="form-grid">
        <Field label="Maximum attempts">
          <input
            name="retry_attempts"
            type="number"
            min={1}
            max={5}
            defaultValue={workflow?.retry_policy?.max_attempts ?? 3}
          />
        </Field>
        <Field label="Initial retry delay (seconds)">
          <input
            name="retry_delay"
            type="number"
            min={1}
            max={3600}
            defaultValue={workflow?.retry_policy?.base_delay_seconds ?? 2}
          />
        </Field>
        <Field label="When no branch matches">
          <select
            name="fallback_action"
            value={chosenFallback}
            onChange={(e) => changeFallback(e.target.value)}
          >
            <option value="">Template default action</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {branches.map((branch, index) => (
        <fieldset key={index}>
          <legend>Branch {index + 1}</legend>
          <div className="automation-branch-order">
            <button type="button" className="quiet-button" disabled={index === 0} aria-label={'Move branch ' + (index + 1) + ' up'} onClick={() => move(index, -1)}>Move Up</button>
            <button type="button" className="quiet-button" disabled={index === branches.length - 1} aria-label={'Move branch ' + (index + 1) + ' down'} onClick={() => move(index, 1)}>Move Down</button>
            <span>Branches run top to bottom; first match wins.</span>
          </div>
          {branch.conditions.map((condition: any, j: number) => (
            <div className="form-grid" key={j}>
              <Field label="Source field">
                <select
                  value={condition.field}
                  onChange={(e) =>
                    update(index, {
                      ...branch,
                      conditions: branch.conditions.map((c: any, k: number) =>
                        k === j
                          ? {
                              field: e.target.value,
                              operator: 'eq',
                              value:
                                e.target.value === 'amount_minor'
                                  ? 0
                                  : e.target.value === 'currency'
                                    ? 'KES'
                                    : e.target.value === 'kind'
                                      ? 'lead'
                                      : e.target.value === 'stage'
                                        ? stages[0]?.id || 'new'
                                        : '',
                            }
                          : c,
                      ),
                    })
                  }
                >
                  {fields.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field label="Condition">
                <select
                  value={condition.operator}
                  onChange={(e) =>
                    update(index, {
                      ...branch,
                      conditions: branch.conditions.map((c: any, k: number) =>
                        k === j ? { ...c, operator: e.target.value } : c,
                      ),
                    })
                  }
                >
                  <option value="eq">Equals</option>
                  {condition.field === 'amount_minor' && (
                    <>
                      <option value="gte">At least</option>
                      <option value="lte">At most</option>
                    </>
                  )}
                </select>
              </Field>
              <Field
                label={
                  condition.field === 'amount_minor'
                    ? 'Amount (' + currency + ')'
                    : condition.field === 'stage'
                      ? 'CRM stage'
                      : condition.field === 'kind'
                        ? 'Record type'
                        : 'Expected value'
                }
              >
                {condition.field === 'currency' ? (
                  <select required value={condition.value} onChange={(e) => update(index, { ...branch, conditions: branch.conditions.map((c: any, k: number) => k === j ? { ...c, value: e.target.value } : c) })}>
                    {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                ) : condition.field === 'kind' ? (
                  <select required value={condition.value} onChange={(e) => update(index, { ...branch, conditions: branch.conditions.map((c: any, k: number) => k === j ? { ...c, value: e.target.value } : c) })}>
                    {['lead', 'opportunity', 'follow_up', 'interaction'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
                  </select>
                ) : condition.field === 'stage' && stages.length > 0 ? (
                  <select required value={condition.value} onChange={(e) => update(index, { ...branch, conditions: branch.conditions.map((c: any, k: number) => k === j ? { ...c, value: e.target.value } : c) })}>
                    {stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                ) : (
                  <input
                    required
                    type={condition.field === 'amount_minor' ? 'number' : 'text'}
                    min={0}
                    step={condition.field === 'amount_minor' ? 1 / factor(currency) : undefined}
                    maxLength={100}
                    inputMode={condition.field === 'amount_minor' ? 'decimal' : undefined}
                    value={condition.field === 'amount_minor'
                      ? amountDrafts[index + ':' + j] ?? String(Number(condition.value) / factor(currency))
                      : condition.value}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (condition.field === 'amount_minor') {
                        setAmountDrafts((current) => ({ ...current, [index + ':' + j]: value }));
                        try {
                          const minor = parseMoney(value, currency);
                          update(index, { ...branch, conditions: branch.conditions.map((c: any, k: number) => k === j ? { ...c, value: minor } : c) });
                        } catch { /* Preserve partially entered money until it has valid currency precision. */ }
                      } else {
                        update(index, { ...branch, conditions: branch.conditions.map((c: any, k: number) => k === j ? { ...c, value } : c) });
                      }
                    }}
                  />
                )}
              </Field>
              {branch.conditions.length > 1 && (
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() =>
                    update(index, {
                      ...branch,
                      conditions: branch.conditions.filter((_: any, k: number) => k !== j),
                    })
                  }
                >
                  Remove condition
                </button>
              )}
            </div>
          ))}
          <button
            className="quiet-button"
            type="button"
            disabled={branch.conditions.length >= 8}
            onClick={() =>
              update(index, {
                ...branch,
                conditions: [
                  ...branch.conditions,
                  { field: 'currency', operator: 'eq', value: currency },
                ],
              })
            }
          >
            Add AND condition
          </button>
          <Field label="Branch action">
            <select
              value={branch.action}
              onChange={(e) => update(index, { ...branch, action: e.target.value })}
            >
              {actions.map((a) => (
                <option key={a} value={a} disabled={disabledActions.includes(a)}>
                  {a.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="quiet-button"
            type="button"
            onClick={() => setBranches((v) => v.filter((_, i) => i !== index))}
          >
            Remove branch
          </button>
        </fieldset>
      ))}
      <button
        className="secondary-button"
        type="button"
        disabled={!fields.length || branches.length >= 10}
        onClick={() =>
          setBranches([
            ...branches,
            {
              conditions: [
                {
                  field: fields[0],
                  operator: 'eq',
                  value: fields[0] === 'amount_minor' ? 0 : fields[0] === 'currency' ? currency : '',
                },
              ],
              action: 'in_app_notification',
            },
          ])
        }
      >
        Add conditional branch
      </button>
    </details>
  );
}
export function workflowBranchValues(d: any) {
  return {
    branches: JSON.parse(d.workflow_branches || '[]'),
    ...(d.fallback_action ? { fallback_action: d.fallback_action } : {}),
    retry_policy: {
      max_attempts: Number(d.retry_attempts ?? 3),
      base_delay_seconds: Number(d.retry_delay ?? 2),
    },
  };
}
