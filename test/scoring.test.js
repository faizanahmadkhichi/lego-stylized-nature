import test from 'node:test'
import assert from 'node:assert/strict'
import Scoring, { normalizeScoringConfig } from '../src/systems/Scoring.js'

function createExperience() {
  const time = {
    elapsed: 0,
    getElapsed() {
      return this.elapsed
    },
  }
  return { config: { scoring: {} }, time, _time: time }
}

test('a kill scores base points with combo 1', () => {
  const scoring = new Scoring(createExperience())
  assert.deepEqual(scoring.addKill('drone'), { points: 100, combo: 1 })
  assert.equal(scoring.score, 100)
  assert.equal(scoring.combo, 1)
})

test('quick successive kills raise the combo multiplier', () => {
  const experience = createExperience()
  const scoring = new Scoring(experience)
  scoring.addKill('drone')
  experience._time.elapsed = 2
  assert.deepEqual(scoring.addKill('balloon'), { points: 100, combo: 2 })
  assert.equal(scoring.score, 200)
  experience._time.elapsed = 4
  assert.deepEqual(scoring.addKill('drone'), { points: 300, combo: 3 })
  assert.equal(scoring.score, 500)
})

test('the combo resets after the combo window', () => {
  const experience = createExperience()
  const scoring = new Scoring(experience)
  scoring.addKill('drone')
  experience._time.elapsed = 6
  assert.deepEqual(scoring.addKill('drone'), { points: 100, combo: 1 })
  assert.equal(scoring.score, 200)
})

test('update expires a stale combo', () => {
  const experience = createExperience()
  const scoring = new Scoring(experience)
  scoring.addKill('drone')
  assert.equal(scoring.combo, 1)
  experience._time.elapsed = 6
  scoring.update()
  assert.equal(scoring.combo, 0)
})

test('the combo caps at maxCombo', () => {
  const experience = createExperience()
  const scoring = new Scoring(experience, { config: { maxCombo: 2 } })
  scoring.addKill('balloon')
  experience._time.elapsed = 1
  assert.deepEqual(scoring.addKill('balloon'), { points: 100, combo: 2 })
  experience._time.elapsed = 2
  assert.deepEqual(scoring.addKill('balloon'), { points: 100, combo: 2 })
})

test('normalizeScoringConfig applies defaults and clamps', () => {
  assert.deepEqual(normalizeScoringConfig(), {
    drone: 100,
    balloon: 50,
    comboWindow: 5,
    maxCombo: 5,
  })
  assert.equal(normalizeScoringConfig({ maxCombo: 0 }).maxCombo, 1)
})
