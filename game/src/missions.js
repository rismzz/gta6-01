// Missions and story: a small state machine over MISSIONS. Each mission has
// ordered steps; the active step gives the HUD its objective text, the
// waypoint beacon its target and the minimap its marker. Completing a mission
// pays out, advances the story and unlocks the next one.
import { MISSIONS } from './config.js';

export function createMissions() {
  const state = {
    index: 0, step: 0, timer: 0, escapeTimer: 0,
    done: 0, active: true, justCompleted: null, failed: false,
  };

  function current() {
    return state.index < MISSIONS.length ? MISSIONS[state.index] : null;
  }

  function currentStep() {
    const mission = current();
    return mission ? mission.steps[state.step] : null;
  }

  /** Text for the HUD objective line. */
  function objectiveText() {
    const mission = current();
    if (!mission) return 'All jobs done — Port Meridian is yours. Free roam!';
    const step = currentStep();
    let text = `${mission.name}: ${step.text}`;
    if (step.time && state.timer > 0) text += ` — ${Math.ceil(state.timer)}s`;
    if (step.type === 'escape' && state.escapeTimer > 0) text += ` — ${Math.ceil(state.escapeTimer)}s`;
    return text;
  }

  /** Waypoint target of the active step, or null. */
  function waypoint() {
    const step = currentStep();
    return step && step.target ? step.target : null;
  }

  function startStep() {
    const step = currentStep();
    state.timer = step && step.time ? step.time : 0;
    state.escapeTimer = step && step.type === 'escape' ? step.seconds : 0;
    state.failed = false;
  }

  function advance() {
    const mission = current();
    state.step += 1;
    if (state.step >= mission.steps.length) {
      state.justCompleted = mission;
      state.done += 1;
      state.index += 1;
      state.step = 0;
    }
    startStep();
    return state.justCompleted;
  }

  /**
   * Advance the mission state one step. `flags` carries what happened this
   * frame: { inCar, atTarget, collected, wanted }. Returns an event string:
   * 'step', 'mission', 'failed' or null.
   */
  function update(dt, flags) {
    const mission = current();
    if (!mission || state.justCompleted) return null;
    const step = currentStep();
    if (step.time) {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.failed = true;
        state.timer = 0;
        startStep();
        return 'failed';
      }
    }
    if (step.type === 'escape') {
      state.escapeTimer -= dt;
      if (state.escapeTimer <= 0) {
        state.escapeTimer = 0;
        advance();
        return state.justCompleted ? 'mission' : 'step';
      }
      return null;
    }
    if (step.type === 'steal' && flags.inCar) {
      advance();
      return state.justCompleted ? 'mission' : 'step';
    }
    if ((step.type === 'drive' || step.type === 'goto') && flags.atTarget) {
      advance();
      return state.justCompleted ? 'mission' : 'step';
    }
    if (step.type === 'collect' && flags.collected) {
      advance();
      return state.justCompleted ? 'mission' : 'step';
    }
    return null;
  }

  /** True when the active step is the last step of its mission. */
  function stepIsLast() {
    const mission = current();
    return mission ? state.step === mission.steps.length - 1 : false;
  }

  function takeCompleted() {
    const done = state.justCompleted;
    state.justCompleted = null;
    return done;
  }

  function reset() {
    state.index = 0;
    state.step = 0;
    state.done = 0;
    state.active = true;
    state.justCompleted = null;
    state.failed = false;
    startStep();
  }

  startStep();
  return {
    state, current, currentStep, objectiveText, waypoint, update,
    stepIsLast, takeCompleted, reset, advance, startStep,
    get missionIndex() { return state.index; },
    get missionsDone() { return state.done; },
  };
}
