/**
 * TEMPORARY EXPERIMENT CONFIG — delete after the system-write matrix run.
 *
 * Normally a pass-through of app.json, so a production build is
 * byte-identical to before this file existed.
 *
 * With AFTERSWITCH_DIAG=1 it produces an ISOLATED diagnostic variant:
 *   * a different applicationId, so it installs ALONGSIDE the real app
 *     rather than over it, and gets its own private data directory — which
 *     is also where the rollback journal lives
 *   * a visibly different name and scheme, so the two cannot be confused on
 *     the launcher or reached by a production deep link
 *   * no googleServicesFile, and an entry point that never imports the
 *     Firebase module, so it cannot reach production Firebase
 *   * no JSON intent filters — a diagnostic build has no business receiving
 *     profile imports
 *
 * The real package (com.afterswitch.app) is never referenced in diag mode.
 */
const base = require('./app.json');

const DIAG = process.env.AFTERSWITCH_DIAG === '1';

module.exports = () => {
  const expo = JSON.parse(JSON.stringify(base.expo));

  if (!DIAG) return expo;

  expo.name = 'AfterSwitch Diagnostic';
  expo.scheme = 'afterswitch-devdiag';
  expo.android = {
    ...expo.android,
    package: 'com.afterswitch.app.devdiag',
  };
  delete expo.android.googleServicesFile;
  delete expo.android.intentFilters;

  return expo;
};
