/* Registers Mezout as a payment method in WooCommerce's block checkout. No build step: uses WordPress's globals. */
(function () {
  var registry = window.wc && window.wc.wcBlocksRegistry;
  if (!registry) return;
  var el = window.wp.element.createElement;
  var decode = window.wp.htmlEntities.decodeEntities;
  var settings = window.wc.wcSettings.getSetting("mezout_data", {});
  var title = decode(settings.title || "Bitcoin, MUSD or MEZO");

  var Content = function () {
    return el("p", null, decode(settings.description || ""));
  };
  var Label = function (props) {
    return el(props.components.PaymentMethodLabel, { text: title });
  };

  registry.registerPaymentMethod({
    name: "mezout",
    label: el(Label),
    content: el(Content),
    edit: el(Content),
    canMakePayment: function () {
      return true;
    },
    ariaLabel: title,
    supports: { features: settings.supports || ["products"] },
  });
})();
