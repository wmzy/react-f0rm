/**
 * Development tools for react-f0rm — entry for `react-f0rm/devtools`.
 *
 * Intentionally NOT re-exported from the main entry: importing this module
 * is the only way the panel code can reach a bundle, so production builds
 * that never use it stay at the baseline main-entry size.
 */
export {default as Devtools} from './Devtools';
export type {DevtoolsPosition, DevtoolsProps} from './Devtools';
