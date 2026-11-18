/**
 * Score the exported v2.1 Linear Regression pipelines.
 * prediction = intercept + sum(coef_i * (x_i - mean_i) / scale_i)
 * This uses the verified coefficient export. It does not load joblib or retrain.
 */

import modelO from '../../models/v21/scdaid_v21_O_LinearRegression.json' with { type: 'json' }
import modelP from '../../models/v21/scdaid_v21_P_LinearRegression.json' with { type: 'json' }
import { featureVector } from './features.js'

const MODELS = { P: modelP, O: modelO }

export function getModel(context) {
  const model = MODELS[context]
  if (!model || model.model_type !== 'LinearRegression') {
    throw new Error(`No verified v2.1 linear model for context ${context}.`)
  }
  return model
}

export function predictStrategy(context, form, pgx, strategy) {
  const model = getModel(context)
  if (!model.strategies.includes(strategy)) {
    throw new Error(`${strategy} is not a strategy in the ${context} model.`)
  }
  const vector = featureVector(model, form, pgx, strategy)
  const { mean, scale, coef, intercept } = model.linear
  let value = intercept
  for (let i = 0; i < vector.length; i += 1) {
    const denominator = scale[i]
    const standardized = denominator === 0 ? 0 : (vector[i] - mean[i]) / denominator
    value += coef[i] * standardized
  }
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite v2.1 prediction for ${strategy}.`)
  }
  return value
}
