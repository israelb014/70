// Runs before the first paint (classic script in <head>): sets <html data-theme> so the page never flashes
// the wrong accent. js/theme.js takes over after that (midnight switch, settings, meta color).
(function () {
  var IDS = ['flame', 'ruby', 'cobalt', 'lime', 'magenta', 'silver', 'champagne'];
  var id = IDS[new Date().getDay()];
  try {
    var st = JSON.parse(localStorage.getItem('seventy.v1') || '{}').settings || {};
    if (st.theme && st.theme !== 'auto' && IDS.indexOf(st.theme) >= 0) id = st.theme;
  } catch (e) { /* storage blocked: the day's theme */ }
  document.documentElement.setAttribute('data-theme', id);
})();
