import type { ImageParameterOption } from '@/types/image'

export function isVipOnlyModel(model: ImageParameterOption) {
  return model.access?.level === 'vip_only'
}

/** Locale key of the one-line model description shown in pickers; models without a known family get none. */
export function getModelDescriptionKey(model: Pick<ImageParameterOption, 'value' | 'code'>) {
  const code = (model.code || model.value || '').toLowerCase()
  if (code.includes('nano-banana-pro')) return 'modelPicker.descriptions.nanoPro'
  if (code.includes('nano-banana')) return 'modelPicker.descriptions.nano'
  if (code.includes('2.6') && code.includes('sunburst')) return 'modelPicker.descriptions.sunburst26'
  if (code.includes('2.6') && code.includes('flare')) return 'modelPicker.descriptions.flare26'
  if (code.includes('sunburst')) return 'modelPicker.descriptions.sunburst'
  if (code.includes('flare')) return 'modelPicker.descriptions.flare'
  if (code.startsWith('gpt-image')) return 'modelPicker.descriptions.gpt'
  return ''
}

/** Prefer the current model while it is usable, otherwise the first model the user may select. */
export function pickUsableModelCode(models: ImageParameterOption[], current: string | null | undefined) {
  const match = models.find((model) => model.value === current)
  if (match && match.access?.available !== false) return match.value
  return models.find((model) => model.access?.available !== false)?.value || match?.value || models[0]?.value || ''
}
