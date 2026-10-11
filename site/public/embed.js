(function () {
  try {
    if (new URLSearchParams(window.location.search).get('embed') === '1') document.documentElement.classList.add('embed');
  } catch (e) { /* no URLSearchParams: show the full page */ }
})();
