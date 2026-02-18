import type { InputState } from "@/lib/game/types";

export const createInputState = (): InputState => ({
  pointerX: null,
  pointerY: null,
  pointerActive: false,
  moveLeft: false,
  moveRight: false,
  moveUp: false,
  moveDown: false,
  keyboardEnabled: true,
  cutRequested: false,
});

export const setPointer = (input: InputState, x: number, y: number, active: boolean): void => {
  input.pointerX = x;
  input.pointerY = y;
  input.pointerActive = active;
};

export const clearPointer = (input: InputState): void => {
  input.pointerActive = false;
};

export const requestCut = (input: InputState): void => {
  input.cutRequested = true;
};

export const consumeCutRequest = (input: InputState): boolean => {
  if (!input.cutRequested) {
    return false;
  }

  input.cutRequested = false;
  return true;
};

export const applyKeyState = (input: InputState, key: string, isDown: boolean): boolean => {
  const normalized = key.toLowerCase();

  if (normalized === "arrowleft" || normalized === "a") {
    input.moveLeft = isDown;
    return true;
  }
  if (normalized === "arrowright" || normalized === "d") {
    input.moveRight = isDown;
    return true;
  }
  if (normalized === "arrowup" || normalized === "w") {
    input.moveUp = isDown;
    return true;
  }
  if (normalized === "arrowdown" || normalized === "s") {
    input.moveDown = isDown;
    return true;
  }
  if ((normalized === " " || normalized === "space" || normalized === "spacebar") && isDown) {
    requestCut(input);
    return true;
  }

  return false;
};
