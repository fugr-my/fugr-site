// FUGR / track.js — what visitors do on the page, reported to Google Analytics 4.
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
// │ TO SWITCH TRACKING ON: paste the GA4 Measurement ID between the quotes on the line below.    │
// │ It looks like G-XXXXXXXXXX. While the quotes are empty nothing is loaded and nothing is sent. │
// └──────────────────────────────────────────────────────────────────────────────────────────────┘
var FUGR_GA4_ID = "";

// Events sent (GA4 > Reports > Engagement > Events):
//   whatsapp_click   a WhatsApp button or link was pressed. Mark this one as a key event in GA4.
//                    cta_location: hero, form, menu, top_button (wide screens), sticky_bar (phones),
//                                  footer, or the section's id
//                    cta_intent:   leaving_malaysia, entering_malaysia, or general
//                    cta_text:     the words on the button
//   email_click      the email address was pressed (same cta_location)
//   section_view     a section was on screen for the first time in this visit (section: its id),
//                    so the report shows how far down the page people get
(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  var on = /^G-[A-Z0-9]{6,}$/.test(FUGR_GA4_ID);
  if (on) {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(FUGR_GA4_ID);
    document.head.appendChild(s);
    window.gtag("js", new Date());
    window.gtag("config", FUGR_GA4_ID);
  }
  var send = function (name, params) { window.gtag("event", name, params || {}); };

  // Where on the page a link sits
  var where = function (el) {
    if (el.closest(".ask")) return "form";
    if (el.closest(".navpanel")) return "menu";
    if (el.closest("#top-cta")) return "top_button";
    if (el.closest("#sticky-cta")) return "sticky_bar";
    if (el.closest(".hero")) return "hero";
    if (el.closest("footer")) return "footer";
    var sec = el.closest("section[id]");
    return sec ? sec.id : "other";
  };
  var words = function (el) {
    var c = el.cloneNode(true), hidden = c.querySelectorAll(".sr-only, svg");
    for (var i = 0; i < hidden.length; i++) hidden[i].remove();
    return c.textContent.replace(/\s+/g, " ").trim().slice(0, 80);
  };

  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || e.defaultPrevented) return;   // the form stops a press when the country is still empty
    var href = a.getAttribute("href") || "";
    if (href.indexOf("wa.me/") !== -1) {
      var intent = /bring%20a%20pet%20into%20Malaysia/i.test(href) ? "entering_malaysia" : /eligibility%20assessment/i.test(href) ? "leaving_malaysia" : "general";
      send("whatsapp_click", { cta_location: where(a), cta_intent: intent, cta_text: words(a) });
    } else if (href.indexOf("mailto:") === 0) {
      send("email_click", { cta_location: where(a) });
    }
  });

  // How far down the page people get: each section, the first time a good part of it is on screen
  if ("IntersectionObserver" in window) {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting || seen[en.target.id]) return;
        seen[en.target.id] = true;
        io.unobserve(en.target);
        send("section_view", { section: en.target.id });
      });
    }, { rootMargin: "-40% 0px -40% 0px" });   // counts once the section crosses the middle of the screen
    var secs = document.querySelectorAll("main section[id]");
    for (var i = 0; i < secs.length; i++) io.observe(secs[i]);
  }
})();
