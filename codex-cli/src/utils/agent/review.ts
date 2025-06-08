export enum ReviewDecision {
  YES = "yes",
  NO_CONTINUE = "no-continue",
  NO_EXIT = "no-exit",
  /**
   * User has approved this command and wants to automatically approve any
   * future identical instances for the remainder of the session.
   */
  ALWAYS = "always",
  /**
   * User wants an explanation of what the command does before deciding.
   */
  EXPLAIN = "explain",
  /**
   * User approves and wants to activate the AI swarm for parallel execution,
   * intelligent coordination, and accelerated development.
   */
  YES_WITH_SWARM = "yes-with-swarm",
  /**
   * User wants to toggle network access on/off.
   */
  TOGGLE_NETWORK = "toggle-network",
  /**
   * User wants to toggle swarm mode on/off.
   */
  TOGGLE_SWARM = "toggle-swarm",
}
