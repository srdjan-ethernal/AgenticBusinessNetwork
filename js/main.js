/* Knockero — boot. Live mode when served by the API, demo mode everywhere else. */
(function (A) {
  A.load();
  A.applyTheme();
  const start = function () { A.render(); };
  if (A.Live) A.Live.init().then(start, start);
  else start();
})(window.ABN);
