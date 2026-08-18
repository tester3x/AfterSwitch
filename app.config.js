/**
 * TEMPORARY EXPERIMENT CONFIG — delete after the experiment.
 *
 * Normally this is a pass-through of app.json, so a production build is
 * byte-identical to before this file existed.
 *
 * With AFTERSWITCH_DIAG=1 it produces an ISOLATED diagnostic variant:
 *   * a different applicationId, so it installs alongside the real app
 *     rather than over it, and gets its own private data directory
 *   * a visibly different name and a different scheme, so the two cannot be
 *     confused on the launcher or by a deep link
 *   * no googleServicesFile, and an entry point that never imports the
 *     Firebase module, so it cannot reach production Firebase
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
  // Cannot reach production Firebase: no services file, and the diagnostic
  // entry point does not import the module that hardcodes the config.
  delete expo.android.googleServicesFile;
  // The JSON intent filters exist to import profiles. A diagnostic build has
  // no business receiving them.
  delete expo.android.intentFilters;

  return expo;
};
