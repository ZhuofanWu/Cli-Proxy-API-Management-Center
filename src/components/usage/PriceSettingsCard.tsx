import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/stores';
import type { ModelPrice } from '@/utils/usage';
import styles from './PriceSettingsCard.module.scss';

export interface PriceSettingsCardProps {
  modelNames: string[];
  modelPrices: Record<string, ModelPrice>;
  onPricesChange: (prices: Record<string, ModelPrice>) => Promise<void> | void;
  disabled?: boolean;
  loading?: boolean;
  helperText?: string;
  className?: string;
}

const getErrorMessage = (value: unknown) => (value instanceof Error ? value.message : '');

const parsePriceInput = (raw: string, fallback?: number): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback ?? 0;
  }
  if (/e/i.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  const [, decimal = ''] = trimmed.split('.');
  if (decimal.length > 3) {
    return null;
  }

  return parsed;
};

export function PriceSettingsCard({
  modelNames,
  modelPrices,
  onPricesChange,
  disabled = false,
  loading = false,
  helperText,
  className,
}: PriceSettingsCardProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  // Add form state
  const [selectedModel, setSelectedModel] = useState('');
  const [promptPrice, setPromptPrice] = useState('');
  const [completionPrice, setCompletionPrice] = useState('');
  const [cachePrice, setCachePrice] = useState('');

  // Edit modal state
  const [editModel, setEditModel] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editCompletion, setEditCompletion] = useState('');
  const [editCache, setEditCache] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resolvedSuggestions = useMemo(
    () => Array.from(new Set([...Object.keys(modelPrices), ...modelNames].map((name) => name.trim()).filter(Boolean))),
    [modelNames, modelPrices]
  );

  const busy = disabled || loading || submitting;

  const getValidatedPriceSet = (
    model: string,
    promptValue: string,
    completionValue: string,
    cacheValue: string
  ): { modelName: string; price: ModelPrice } | null => {
    const modelName = model.trim();
    if (!modelName) {
      showNotification(t('usage_stats.model_price_model_required'), 'error');
      return null;
    }

    const prompt = parsePriceInput(promptValue);
    const completion = parsePriceInput(completionValue);
    const cache = parsePriceInput(cacheValue, prompt ?? undefined);
    if (prompt === null || completion === null || cache === null) {
      showNotification(t('usage_stats.model_price_precision_hint'), 'error');
      return null;
    }

    return {
      modelName,
      price: {
        prompt,
        completion,
        cache,
      },
    };
  };

  const commitPrices = async (prices: Record<string, ModelPrice>, successMessage?: string) => {
    setSubmitting(true);
    try {
      await onPricesChange(prices);
      if (successMessage) {
        showNotification(successMessage, 'success');
      }
      return true;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      showNotification(
        `${t('notification.save_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePrice = async () => {
    const nextPrice = getValidatedPriceSet(selectedModel, promptPrice, completionPrice, cachePrice);
    if (!nextPrice) {
      return;
    }

    const newPrices = { ...modelPrices, [nextPrice.modelName]: nextPrice.price };
    const saved = await commitPrices(newPrices, t('usage_stats.model_price_saved'));
    if (!saved) {
      return;
    }

    setSelectedModel('');
    setPromptPrice('');
    setCompletionPrice('');
    setCachePrice('');
  };

  const handleDeletePrice = async (model: string) => {
    const newPrices = { ...modelPrices };
    delete newPrices[model];
    setSubmitting(true);
    try {
      await onPricesChange(newPrices);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      showNotification(
        `${t('notification.delete_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (model: string) => {
    const price = modelPrices[model];
    setEditModel(model);
    setEditPrompt(price?.prompt?.toString() || '');
    setEditCompletion(price?.completion?.toString() || '');
    setEditCache(price?.cache?.toString() || '');
  };

  const handleSaveEdit = async () => {
    if (!editModel) return;

    const nextPrice = getValidatedPriceSet(editModel, editPrompt, editCompletion, editCache);
    if (!nextPrice) {
      return;
    }

    const newPrices = { ...modelPrices, [nextPrice.modelName]: nextPrice.price };
    const saved = await commitPrices(newPrices, t('usage_stats.model_price_saved'));
    if (!saved) {
      return;
    }

    setEditModel(null);
  };

  const handleModelSelect = (value: string) => {
    setSelectedModel(value);
    const price = modelPrices[value];
    if (price) {
      setPromptPrice(price.prompt.toString());
      setCompletionPrice(price.completion.toString());
      setCachePrice(price.cache.toString());
    } else {
      setPromptPrice('');
      setCompletionPrice('');
      setCachePrice('');
    }
  };

  return (
    <Card title={t('usage_stats.model_price_settings')} className={className}>
      <div className={styles.pricingSection}>
        {helperText && <div className={styles.helperText}>{helperText}</div>}

        {/* Price Form */}
        <div className={styles.priceForm}>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_name')}</label>
              <AutocompleteInput
                value={selectedModel}
                options={resolvedSuggestions}
                onChange={handleModelSelect}
                placeholder={t('usage_stats.model_price_select_placeholder')}
                hint={t('usage_stats.model_price_select_hint')}
                disabled={busy}
              />
            </div>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_price_prompt')} ($/1M)</label>
              <Input
                type="number"
                value={promptPrice}
                onChange={(e) => setPromptPrice(e.target.value)}
                placeholder="0.00"
                step="0.001"
                min="0"
                disabled={busy}
              />
            </div>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_price_completion')} ($/1M)</label>
              <Input
                type="number"
                value={completionPrice}
                onChange={(e) => setCompletionPrice(e.target.value)}
                placeholder="0.00"
                step="0.001"
                min="0"
                disabled={busy}
              />
            </div>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_price_cache')} ($/1M)</label>
              <Input
                type="number"
                value={cachePrice}
                onChange={(e) => setCachePrice(e.target.value)}
                placeholder="0.00"
                step="0.001"
                min="0"
                disabled={busy}
              />
            </div>
            <Button
              variant="primary"
              onClick={() => void handleSavePrice()}
              disabled={!selectedModel.trim() || busy}
              loading={submitting}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>

        {/* Saved Prices List */}
        <div className={styles.pricesList}>
          <h4 className={styles.pricesTitle}>{t('usage_stats.saved_prices')}</h4>
          {Object.keys(modelPrices).length > 0 ? (
            <div className={styles.pricesGrid}>
              {Object.entries(modelPrices).map(([model, price]) => (
                <div key={model} className={styles.priceItem}>
                  <div className={styles.priceInfo}>
                    <span className={styles.priceModel}>{model}</span>
                    <div className={styles.priceMeta}>
                      <span>
                        {t('usage_stats.model_price_prompt')}: ${price.prompt.toFixed(4)}/1M
                      </span>
                      <span>
                        {t('usage_stats.model_price_completion')}: ${price.completion.toFixed(4)}/1M
                      </span>
                      <span>
                        {t('usage_stats.model_price_cache')}: ${price.cache.toFixed(4)}/1M
                      </span>
                    </div>
                  </div>
                  <div className={styles.priceActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEdit(model)}
                      disabled={busy}
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void handleDeletePrice(model)}
                      disabled={busy}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.hint}>
              {loading ? t('common.loading') : t('usage_stats.model_price_empty')}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        open={editModel !== null}
        title={editModel ?? ''}
        onClose={() => setEditModel(null)}
        footer={
          <div className={styles.priceActions}>
            <Button variant="secondary" onClick={() => setEditModel(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void handleSaveEdit()} loading={submitting}>
              {t('common.save')}
            </Button>
          </div>
        }
        width={420}
      >
        <div className={styles.editModalBody}>
          <div className={styles.formField}>
            <label>{t('usage_stats.model_price_prompt')} ($/1M)</label>
            <Input
              type="number"
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="0.00"
              step="0.001"
              min="0"
              disabled={busy}
            />
          </div>
          <div className={styles.formField}>
            <label>{t('usage_stats.model_price_completion')} ($/1M)</label>
            <Input
              type="number"
              value={editCompletion}
              onChange={(e) => setEditCompletion(e.target.value)}
              placeholder="0.00"
              step="0.001"
              min="0"
              disabled={busy}
            />
          </div>
          <div className={styles.formField}>
            <label>{t('usage_stats.model_price_cache')} ($/1M)</label>
            <Input
              type="number"
              value={editCache}
              onChange={(e) => setEditCache(e.target.value)}
              placeholder="0.00"
              step="0.001"
              min="0"
              disabled={busy}
            />
          </div>
        </div>
      </Modal>
    </Card>
  );
}
