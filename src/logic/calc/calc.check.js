import fs from 'node:fs'
import { runLibraryCase } from './library.js'
import { calculateDose } from './dose.js'

const libraryPath = process.argv[2]
const dosePath = process.argv[3]
const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'))
const doses = JSON.parse(fs.readFileSync(dosePath, 'utf8'))

function close(actual, expected, tolerance) {
  if (typeof expected === 'number') {
    return typeof actual === 'number' && Math.abs(actual - expected) <= (tolerance ?? 0)
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item, index) => close(actual[index], item, tolerance))
  }
  return actual === expected
}

let failed = 0

for (const test of library.cases) {
  const actual = runLibraryCase(test.calculation, test.input)
  const misses = Object.entries(test.expected).filter(([key, value]) => !close(actual?.[key], value, test.tolerance))
  if (misses.length) {
    failed += 1
    console.log('FAIL', test.id, misses.map(([key]) => key).join(','), 'got', JSON.stringify(actual))
  } else {
    console.log('PASS', test.id)
  }
}

const exactKeys = ['status', 'dose', 'unit', 'dose_range', 'interval', 'max_daily_mg', 'escalation_dose', 'maintenance_range', 'maintenance_interval', 'rules']

for (const test of doses.cases) {
  const actual = calculateDose(test.input)
  const misses = []
  for (const key of exactKeys) {
    if (test.expected[key] === undefined) continue
    if (!close(actual[key] ?? null, test.expected[key] ?? null, 0)) misses.push(key)
  }
  for (const key of ['flags', 'confirmations']) {
    const wanted = test.expected[key] || []
    if (!wanted.every((item) => (actual[key] || []).includes(item))) misses.push(key)
  }
  if (test.expected.trace) {
    for (const [key, value] of Object.entries(test.expected.trace)) {
      if (!close(actual.trace?.[key], value, 0.001)) misses.push(`trace.${key}`)
    }
  }
  if (test.expected.home_mme_mg_day !== undefined && !close(actual.home_mme_mg_day, test.expected.home_mme_mg_day, 0.001)) {
    misses.push('home_mme_mg_day')
  }
  if (misses.length) {
    failed += 1
    console.log('FAIL', test.id, misses.join(', '))
    console.log('  expected', JSON.stringify(Object.fromEntries(exactKeys.map((key) => [key, test.expected[key]]))))
    console.log('  actual  ', JSON.stringify(Object.fromEntries(exactKeys.map((key) => [key, actual[key]]))))
    console.log('  flags', actual.flags, 'conf', actual.confirmations, 'trace', actual.trace)
  } else {
    console.log('PASS', test.id)
  }
}

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('all calculation tests passed')
