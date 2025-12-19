// Global Constants
export const MIN_SPEED = 60;
export const MAX_SPEED = 120;
export const alphaParam = 1;
export const betaParam = 2;
export const GAME_RADIUS = 400; // Radius of game circle
export const ARROW_FACTOR = 30;

export const randSeed = 12345; // Seed for random number generator

export const playerImage = new Image();
playerImage.src = new URL("../../assets/player.png", import.meta.url).href;

export const trapImage = new Image();
trapImage.src = new URL("../../assets/trap_img.png", import.meta.url).href;

export const BALL_TYPES = {
  NORMAL: 'red',
  BLUE: 'blue',
  GREEN_TURNER: 'green_turner',
  BOMB: 'bomb',
};