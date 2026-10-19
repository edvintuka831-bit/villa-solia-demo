// Sends visitors to their browser language (bs/en/de), defaulting to Bosnian.
(function () {
  var supported = ["bs", "en", "de"];
  var langs = navigator.languages || [navigator.language || "bs"];
  var pick = "bs";
  for (var i = 0; i < langs.length; i++) {
    var code = String(langs[i]).slice(0, 2).toLowerCase();
    if (code === "hr" || code === "sr") code = "bs";
    if (supported.indexOf(code) !== -1) { pick = code; break; }
  }
  location.replace(pick + "/");
})();
