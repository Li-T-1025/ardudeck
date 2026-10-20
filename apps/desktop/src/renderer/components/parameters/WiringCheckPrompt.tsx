import { useEffect, useState } from 'react';
import { Cable } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParameterStore } from '../../stores/parameter-store.js';
import { useConnectionStore } from '../../stores/connection-store.js';
import { useVehicleSetupStore } from '../../stores/vehicle-setup-store.js';
import { currentSetupStatus } from '../../modules/module-setup-api.js';
import { checkKind, wiringStepsFor } from '../../lib/wiring-checks.js';
import { detectSetupVehicle } from '../../../shared/vehicle-setup/plans.js';
import type { SetupStepId } from '../../../shared/vehicle-setup/types.js';

// Mounted at the root: both compare-modal copies close themselves on a clean apply.
export function WiringCheckPrompt() {
  const { t } = useTranslation();
  const outcome = useParameterStore((s) => s.lastFileApplyOutcome);
  const modalOpen = useParameterStore((s) => s.showCompareModal);
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const wizardOpen = useVehicleSetupStore((s) => s.open);
  const [steps, setSteps] = useState<SetupStepId[]>([]);

  useEffect(() => {
    if (!outcome?.changes?.length || !isConnected) return;
    // The wizard leads to its own checks; dropping (not just hiding) keeps the prompt from popping up after it closes.
    if (useVehicleSetupStore.getState().open) {
      setSteps([]);
      return;
    }
    const params = useParameterStore.getState().parameters;
    const read = (n: string) => params.get(n)?.value;
    const vehicle = detectSetupVehicle(useConnectionStore.getState().connectionState.mavType, read);
    setSteps(vehicle ? wiringStepsFor(outcome.changes, vehicle, read) : []);
  }, [outcome, isConnected]);

  if (steps.length === 0 || modalOpen || wizardOpen) return null;

  // A step this vehicle's plan lacks would open nothing, so fall back to the wizard start.
  const open = async (step: SetupStepId) => {
    setSteps([]);
    const status = await currentSetupStatus();
    useVehicleSetupStore.getState().openAt(status?.steps.some((s) => s.id === step) ? step : undefined);
  };

  return (
    <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-[120]">
      <div className="bg-surface-solid border border-subtle rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-subtle flex items-center gap-3">
          <Cable className="w-5 h-5 text-amber-400 shrink-0" />
          <h3 className="text-lg font-semibold text-content">{t('parameters:parameterCompareModal.wiringCheckTitle')}</h3>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-content-secondary">{t('parameters:parameterCompareModal.wiringCheckBody')}</p>
          {steps.map((step) => (
            <button
              key={step}
              onClick={() => void open(step)}
              className="w-full px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 rounded-lg text-sm font-medium transition-colors"
            >
              {t(`parameters:parameterCompareModal.wiringCheck.${checkKind(step)}`)}
            </button>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-subtle flex justify-end">
          <button onClick={() => setSteps([])} className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors">
            {t('common:close')}
          </button>
        </div>
      </div>
    </div>
  );
}
