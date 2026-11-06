(function (global) {
  "use strict";

  function embedUrl(checkoutUrl) {
    var url = new URL(checkoutUrl, global.location.href);
    url.searchParams.set("embed", "1");
    return url;
  }

  function open(options) {
    if (!options || !options.checkoutUrl) throw new Error("Mezout.open requires checkoutUrl");
    var url = embedUrl(options.checkoutUrl);
    var frame;
    var popup;
    var closed = false;

    var backdrop = document.createElement("div");
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", options.title || "Complete payment");
    backdrop.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:16px;background:rgb(28 25 23/.55)";

    var modal = document.createElement("div");
    modal.style.cssText = "width:min(100%,520px);height:min(780px,calc(100vh - 32px));overflow:hidden;border-radius:16px;background:#fff;box-shadow:0 24px 80px rgb(0 0 0/.3)";
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #e7e5e4;font:600 15px system-ui,sans-serif";
    bar.append(document.createTextNode(options.title || "Complete payment"));
    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:12px";

    function button(label, action) {
      var element = document.createElement("button");
      element.type = "button";
      element.textContent = label;
      element.style.cssText = "border:0;padding:0;background:transparent;text-decoration:underline;cursor:pointer";
      element.addEventListener("click", action);
      return element;
    }

    function openPopup() {
      popup = global.open(url.toString(), "mezout-checkout", "popup,width=520,height=760");
      if (popup && frame) {
        frame.replaceWith(Object.assign(document.createElement("p"), { textContent: "Checkout opened in a new window. Keep this page open while you pay." }));
        frame = null;
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      global.removeEventListener("message", receive);
      popup && popup.close();
      backdrop.remove();
      options.onClose && options.onClose();
    }

    actions.append(button("Open in new window", openPopup), button("Close", close));
    bar.append(actions);
    modal.append(bar);
    frame = document.createElement("iframe");
    frame.src = url.toString();
    frame.title = options.title || "Complete payment";
    frame.referrerPolicy = "strict-origin";
    frame.allow = "clipboard-write";
    frame.style.cssText = "width:100%;height:calc(100% - 49px);border:0";
    modal.append(frame);
    backdrop.append(modal);
    document.body.append(backdrop);

    function receive(event) {
      if (event.origin !== url.origin || (event.source !== (frame && frame.contentWindow) && event.source !== popup)) return;
      if (event.data && event.data.type === "mezout:paid" && options.onPaid) options.onPaid(event.data);
      if (event.data && event.data.type === "mezout:closed") close();
    }
    global.addEventListener("message", receive);
    backdrop.addEventListener("mousedown", function (event) { if (event.target === backdrop) close(); });
    return { close: close, openPopup: openPopup };
  }

  global.Mezout = Object.freeze({ open: open });
  document.addEventListener("click", function (event) {
    var trigger = event.target.closest && event.target.closest("[data-mezout-checkout]");
    if (trigger) open({ checkoutUrl: trigger.getAttribute("data-mezout-checkout") });
  });
})(window);
