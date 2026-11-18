/* global process */
/**
 * Website dose regression runner (2026-11-13).
 * Runs every case of the v2.1 research test files unchanged, except the five cases
 * superseded by the approved renal and hepatic safety corrections, which are checked
 * against dose_expected_2026-11-13.json. The research files are not modified.
 * Run: node src/logic/calc/dose.check.js <calculation_library_test_cases.json> <dose_test_cases.json>
 */

import fs from 'node:fs'
import { runLibraryCase } from './library.js'
import { calculateDose } from './dose.js'

const library = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const doses = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
const superseded = JSON.parse(fs.readFileSync(new URL('./dose_expected_2026-11-13.json', import.meta.url), 'utf8'))
const override = Object.fromEntries(superseded.supersedes.map((item) => [item.id, item]))

function close(actual, expected, tolerance) {
  if (typeof expected === 'number') return typeof actual === 'number' && Math.abs(actual - expected) <= (tolerance ?? 0)
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, index) => close(actual[index], item, tolerance))
  return actual === expected
}

let failed = 0
let passed = 0
for (const test of library.cases) {
  const actual = runLibraryCase(test.calculation, test.input)
  const misses = Object.entries(test.expected).filter(([key, value]) => !close(actual?.[key], value, test.tolerance))
  if (misses.length) {
    failed += 1
    console.log('FAIL', test.id, misses.map(([key]) => key).join(','))
  } else passed += 1
}

const exactKeys = ['status', 'dose', 'dose_range', 'interval', 'max_daily_mg', 'escalation_dose', 'maintenance_range', 'maintenance_interval', 'rules']
let used = 0
for (const test of doses.cases) {
  const actual = calculateDose(test.input)
  const replacement = override[test.id]
  const expected = replacement ? replacement.expected : test.expected
  if (replacement) used += 1
  const misses = []
  for (const key of exactKeys) {
    if (expected[key] === undefined) continue
    if (!close(actual[key] ?? null, expected[key] ?? null, 0)) misses.push(key)
  }
  for (const key of ['flags', 'confirmations']) {
    if (!(expected[key] || []).every((item) => (actual[key] || []).includes(item))) misses.push(key)
  }
  if (!replacement && expected.trace) {
    for (const [key, value] of Object.entries(expected.trace)) {
      if (!close(actual.trace?.[key], value, 0.001)) misses.push(`trace.${key}`)
    }
  }
  if (replacement && !actual.reason) misses.push('reason')
  if (misses.length) {
    failed += 1
    console.log('FAIL', test.id, misses.join(', '), JSON.stringify(Object.fromEntries(exactKeys.map((key) => [key, actual[key]]))))
  } else {
    passed += 1
    if (replacement) console.log(`PASS ${test.id} (superseded 2026-11-13: ${replacement.drug_route})`)
  }
}

if (used !== superseded.supersedes.length) {
  failed += 1
  console.log(`FAIL superseded cases found ${used}/${superseded.supersedes.length}`)
}
console.log(`\n${passed} passed, ${failed} failed (${library.cases.length} library + ${doses.cases.length} dose cases; ${used} superseded)`)
if (failed) process.exit(1)
