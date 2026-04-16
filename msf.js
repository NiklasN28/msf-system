/**
 * MSF — Multi-Step Form System
 * Version: 0.1.0
 * ----------------------------------------
 * Einbindung:
 *   <script src="https://USERNAME.github.io/msf-system/msf.js"></script>
 *
 * Nutzung pro Projekt (Page Custom Code):
 *   MSF.init({ formId: "...", progress: {...}, steps: [...] })
 */

(function (global) {
  "use strict";

  // ============================================================
  // 1. CONSTANTS — Fehlermeldungen & Validator-Patterns
  // ============================================================

  const MESSAGES = {
    de: {
      required: "Bitte fülle dieses Feld aus.",
      requiredChoice: "Bitte wähle eine Option aus.",
      requiredMulti: "Bitte wähle mindestens {min} Option(en) aus.",
      email: "Bitte gib eine gültige E-Mail-Adresse ein.",
      phone: "Bitte gib eine gültige Telefonnummer ein.",
      maxLength: "Maximale Länge: {max} Zeichen.",
    },
  };

  const PATTERNS = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^[+\d\s\-().]{7,20}$/,
  };

  // ============================================================
  // 2. STATE — zentraler Zustand, alles läuft hierüber
  // ============================================================

  let state = {
    config: null, // formConfig nach init()
    current: 0, // aktiver Step-Index
    data: {}, // gesammelte Daten { stepId: value }
    form: null, // das <form> Element
    stepEls: [], // alle [data-msf-step] Elemente
  };

  // ============================================================
  // 3. HELPERS
  // ============================================================

  function msg(key, vars, lang) {
    lang = lang || (state.config && state.config.language) || "de";
    let text = (MESSAGES[lang] || MESSAGES.de)[key] || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        text = text.replace("{" + k + "}", vars[k]);
      });
    }
    return text;
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  // ============================================================
  // 4. RENDER — baut Steps aus Config ins DOM
  // ============================================================

  const RENDERERS = {
    "single-choice": function (step, fieldset) {
      var optionsEl = qs("[data-msf-options]", fieldset);
      step.options.forEach(function (opt) {
        var label = document.createElement("label");
        label.className = "msf-option";

        var input = document.createElement("input");
        input.type = "radio";
        input.name = step.id;
        input.value = opt.value;
        input.className = "msf-radio";

        var span = document.createElement("span");
        span.textContent = opt.label;

        label.appendChild(input);
        label.appendChild(span);
        optionsEl.appendChild(label);
      });
    },

    "multi-choice": function (step, fieldset) {
      var optionsEl = qs("[data-msf-options]", fieldset);
      step.options.forEach(function (opt) {
        var label = document.createElement("label");
        label.className = "msf-option";

        var input = document.createElement("input");
        input.type = "checkbox";
        input.name = step.id;
        input.value = opt.value;
        input.className = "msf-checkbox";

        var span = document.createElement("span");
        span.textContent = opt.label;

        label.appendChild(input);
        label.appendChild(span);
        optionsEl.appendChild(label);
      });
    },

    textarea: function (step, fieldset) {
      var optionsEl = qs("[data-msf-options]", fieldset);
      var textarea = document.createElement("textarea");
      textarea.name = step.id;
      textarea.className = "msf-textarea";
      textarea.placeholder = step.placeholder || "";
      if (step.maxLength) textarea.maxLength = step.maxLength;
      optionsEl.appendChild(textarea);
    },

    text: function (step, fieldset) {
      var optionsEl = qs("[data-msf-options]", fieldset);
      var input = document.createElement("input");
      input.type = "text";
      input.name = step.id;
      input.className = "msf-input";
      input.placeholder = step.placeholder || "";
      optionsEl.appendChild(input);
    },

    email: function (step, fieldset) {
      var optionsEl = qs("[data-msf-options]", fieldset);
      var input = document.createElement("input");
      input.type = "email";
      input.name = step.id;
      input.className = "msf-input";
      input.placeholder = step.placeholder || "du@beispiel.de";
      // Autocomplete für bessere UX
      input.autocomplete = "email";
      optionsEl.appendChild(input);
    },

    phone: function (step, fieldset) {
      var optionsEl = qs("[data-msf-options]", fieldset);
      var input = document.createElement("input");
      input.type = "tel";
      input.name = step.id;
      input.className = "msf-input";
      input.placeholder = step.placeholder || "+49 123 456789";
      input.autocomplete = "tel";
      // Nur Zahlen, +, Leerzeichen, Bindestriche erlaubt
      input.addEventListener("input", function () {
        this.value = this.value.replace(/[^\d\s\-+().]/g, "");
      });
      optionsEl.appendChild(input);
    },

    summary: function (step, fieldset) {
      var optionsEl = qs("[data-msf-options]", fieldset);
      var div = document.createElement("div");
      div.className = "msf-summary";
      div.setAttribute("data-msf-summary-content", "");
      optionsEl.appendChild(div);
    },
  };

  function buildSteps() {
    var stepsContainer = qs("[data-msf='steps']", state.form);
    if (!stepsContainer) {
      console.error("MSF: kein [data-msf='steps'] gefunden.");
      return;
    }

    state.config.steps.forEach(function (step, index) {
      // Fieldset erstellen
      var fieldset = document.createElement("fieldset");
      fieldset.className = "msf-step";
      fieldset.setAttribute("data-msf-step", index);
      fieldset.hidden = true; // alle versteckt, updateUI zeigt den aktiven

      // Legend = die Frage (Accessibility: wird mit Inputs verknüpft)
      var legend = document.createElement("legend");
      legend.className = "msf-question";
      legend.id = "msf-legend-" + index;
      legend.textContent = step.question || "";
      fieldset.appendChild(legend);

      // Options-Container
      var optionsDiv = document.createElement("div");
      optionsDiv.setAttribute("data-msf-options", "");
      optionsDiv.className = "msf-options";
      fieldset.appendChild(optionsDiv);

      // Error-Container (aria-live für Screen Reader)
      var errorSpan = document.createElement("span");
      errorSpan.setAttribute("data-msf-error", "");
      errorSpan.className = "msf-error";
      errorSpan.setAttribute("role", "alert");
      errorSpan.setAttribute("aria-live", "polite");
      fieldset.appendChild(errorSpan);

      // Renderer aufrufen
      var renderer = RENDERERS[step.type];
      if (renderer) {
        renderer(step, fieldset);
      } else {
        console.warn("MSF: unbekannter Step-Typ:", step.type);
      }

      stepsContainer.appendChild(fieldset);
    });

    // Referenz auf alle Step-Elemente speichern
    state.stepEls = qsa("[data-msf-step]", state.form);
  }

  // ============================================================
  // 5. PROGRESS — bar / dots / numbers (austauschbar)
  // ============================================================

  const PROGRESS_RENDERERS = {
    bar: function (container, current, total) {
      // Einmalig aufbauen
      if (!qs(".msf-progress-bar-track", container)) {
        container.innerHTML =
          '<div class="msf-progress-bar-track">' +
          '<div class="msf-progress-bar-fill"></div>' +
          "</div>" +
          '<span class="msf-progress-count"></span>';
      }
      var fill = qs(".msf-progress-bar-fill", container);
      var count = qs(".msf-progress-count", container);
      var percent = Math.round(((current + 1) / total) * 100);
      fill.style.width = percent + "%";
      fill.setAttribute("aria-valuenow", percent);
      if (state.config.progress.showCount) {
        count.textContent = "Schritt " + (current + 1) + " von " + total;
      }
    },

    dots: function (container, current, total) {
      var html = '<ol class="msf-progress-dots" aria-label="Fortschritt">';
      for (var i = 0; i < total; i++) {
        var isCurrent = i === current;
        var isDone = i < current;
        var label = isDone
          ? "Abgeschlossen"
          : isCurrent
            ? "Aktuell"
            : "Ausstehend";
        html +=
          '<li class="msf-dot' +
          (isDone ? " msf-dot--done" : "") +
          (isCurrent ? " msf-dot--active" : "") +
          '" aria-label="Schritt ' +
          (i + 1) +
          ": " +
          label +
          '"></li>';
      }
      html += "</ol>";
      if (state.config.progress.showCount) {
        html +=
          '<span class="msf-progress-count">Schritt ' +
          (current + 1) +
          " von " +
          total +
          "</span>";
      }
      container.innerHTML = html;
    },

    numbers: function (container, current, total) {
      var html = '<ol class="msf-progress-numbers" aria-label="Fortschritt">';
      for (var i = 0; i < total; i++) {
        var isCurrent = i === current;
        var isDone = i < current;
        html +=
          '<li class="msf-step-number' +
          (isDone ? " msf-step-number--done" : "") +
          (isCurrent ? " msf-step-number--active" : "") +
          '" aria-current="' +
          (isCurrent ? "step" : "false") +
          '">' +
          (i + 1) +
          "</li>";
      }
      html += "</ol>";
      if (state.config.progress.showCount) {
        html +=
          '<span class="msf-progress-count">Schritt ' +
          (current + 1) +
          " von " +
          total +
          "</span>";
      }
      container.innerHTML = html;
    },
  };

  function updateProgress() {
    var container = qs("[data-msf='progress']", state.form);
    if (!container) return;

    // Summary-Step aus Total rausrechnen (kein echter Step für den User)
    var visibleSteps = state.config.steps.filter(function (s) {
      return s.type !== "success";
    });
    var total = visibleSteps.length;
    var current = state.current;

    var type = (state.config.progress && state.config.progress.type) || "bar";
    var renderer = PROGRESS_RENDERERS[type] || PROGRESS_RENDERERS["bar"];
    renderer(container, current, total);
  }

  // ============================================================
  // 6. VALIDATION — Validator-Map pro Feldtyp
  // ============================================================

  const VALIDATORS = {
    "single-choice": function (step, fieldset) {
      var checked = qs("input[name='" + step.id + "']:checked", fieldset);
      if (step.required && !checked) {
        return msg("requiredChoice");
      }
      return null;
    },

    "multi-choice": function (step, fieldset) {
      var checked = qsa("input[name='" + step.id + "']:checked", fieldset);
      var min = step.minSelect || (step.required ? 1 : 0);
      if (checked.length < min) {
        return msg("requiredMulti", { min: min });
      }
      return null;
    },

    textarea: function (step, fieldset) {
      var el = qs("textarea[name='" + step.id + "']", fieldset);
      if (step.required && (!el || !el.value.trim())) {
        return msg("required");
      }
      return null;
    },

    text: function (step, fieldset) {
      var el = qs("input[name='" + step.id + "']", fieldset);
      if (step.required && (!el || !el.value.trim())) {
        return msg("required");
      }
      return null;
    },

    email: function (step, fieldset) {
      var el = qs("input[name='" + step.id + "']", fieldset);
      var val = el ? el.value.trim() : "";
      if (step.required && !val) return msg("required");
      if (val && !PATTERNS.email.test(val)) return msg("email");
      return null;
    },

    phone: function (step, fieldset) {
      var el = qs("input[name='" + step.id + "']", fieldset);
      var val = el ? el.value.trim() : "";
      if (step.required && !val) return msg("required");
      if (val && !PATTERNS.phone.test(val)) return msg("phone");
      return null;
    },

    summary: function () {
      return null;
    }, // kein Input, immer valid
  };

  function validateStep(index) {
    var step = state.config.steps[index];
    var fieldset = state.stepEls[index];
    var errorEl = qs("[data-msf-error]", fieldset);

    // Fehlermeldung zurücksetzen
    if (errorEl) errorEl.textContent = "";

    var validator = VALIDATORS[step.type];
    if (!validator) return true;

    var error = validator(step, fieldset);
    if (error) {
      if (errorEl) errorEl.textContent = error;
      // Focus auf erstes fehlerhaftes Feld
      var firstInput = qs("input, textarea, select", fieldset);
      if (firstInput) firstInput.focus();
      return false;
    }
    return true;
  }

  // ============================================================
  // 7. DATA COLLECTION — Werte sammeln + in hidden inputs schreiben
  // ============================================================

  function collectStepData(index) {
    var step = state.config.steps[index];
    var fieldset = state.stepEls[index];

    if (step.type === "single-choice") {
      var checked = qs("input[name='" + step.id + "']:checked", fieldset);
      state.data[step.id] = checked ? checked.value : "";
    } else if (step.type === "multi-choice") {
      var checkedBoxes = qsa("input[name='" + step.id + "']:checked", fieldset);
      state.data[step.id] = checkedBoxes.map(function (el) {
        return el.value;
      });
    } else if (
      step.type === "textarea" ||
      step.type === "text" ||
      step.type === "email" ||
      step.type === "phone"
    ) {
      var el = qs(
        "input[name='" + step.id + "'], textarea[name='" + step.id + "']",
        fieldset,
      );
      state.data[step.id] = el ? el.value.trim() : "";
    }
    // summary & success: keine Daten
  }

  function writeHiddenInputs() {
    var container = qs("[data-msf-hidden]", state.form);
    if (!container) return;
    container.innerHTML = ""; // reset

    Object.keys(state.data).forEach(function (key) {
      var val = state.data[key];
      // Arrays (multi-choice) als kommaseparierter String
      if (Array.isArray(val)) val = val.join(", ");

      var input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = val;
      container.appendChild(input);
    });
  }

  // ============================================================
  // 8. SUMMARY — zeigt gesammelte Antworten vor Submit
  // ============================================================

  function renderSummary(index) {
    var fieldset = state.stepEls[index];
    var summaryDiv = qs("[data-msf-summary-content]", fieldset);
    if (!summaryDiv) return;

    summaryDiv.innerHTML = "";

    state.config.steps.forEach(function (step) {
      if (step.type === "summary" || step.type === "success") return;
      var val = state.data[step.id];
      if (!val || (Array.isArray(val) && val.length === 0)) return;

      var row = document.createElement("div");
      row.className = "msf-summary-row";

      var label = document.createElement("span");
      label.className = "msf-summary-label";
      label.textContent = step.question || step.id;

      var value = document.createElement("span");
      value.className = "msf-summary-value";
      value.textContent = Array.isArray(val) ? val.join(", ") : val;

      row.appendChild(label);
      row.appendChild(value);
      summaryDiv.appendChild(row);
    });
  }

  // ============================================================
  // 9. NAVIGATION — updateUI, next, prev, goToStep
  // ============================================================

  function updateUI() {
    // Abbruch wenn noch keine Steps gebaut wurden
    if (!state.stepEls || !state.stepEls.length) return;

    // Steps ein-/ausblenden
    state.stepEls.forEach(function (el, i) {
      el.hidden = i !== state.current;
    });

    // Summary befüllen wenn aktiv
    var currentStep = state.config.steps[state.current];
    if (currentStep && currentStep.type === "summary") {
      renderSummary(state.current);
    }

    // Buttons
    var prevBtn = qs("[data-msf-prev]", state.form);
    var nextBtn = qs("[data-msf-next]", state.form);
    var submitBtn = qs("[data-msf-submit]", state.form);

    var isFirst = state.current === 0;
    var isLast = state.current === state.config.steps.length - 1;
    var isPreSubmit = currentStep && currentStep.type === "summary";

    if (prevBtn) prevBtn.hidden = isFirst;
    if (nextBtn) nextBtn.hidden = isLast || isPreSubmit;
    if (submitBtn) submitBtn.hidden = !isPreSubmit;

    // Progress aktualisieren
    updateProgress();

    // Accessibility: Focus auf den aktiven Step setzen
    var activeFieldset = state.stepEls[state.current];
    if (activeFieldset) {
      activeFieldset.setAttribute("tabindex", "-1");
      activeFieldset.focus();
    }
  }

  function goToStep(index) {
    if (index < 0 || index >= state.config.steps.length) return;
    state.current = index;
    updateUI();
  }

  function next() {
    if (!validateStep(state.current)) return;
    collectStepData(state.current);
    goToStep(state.current + 1);
  }

  function prev() {
    goToStep(state.current - 1);
  }

  // ============================================================
  // 10. SUBMIT ADAPTER
  // ============================================================

  function submitForm() {
    writeHiddenInputs();
    // Webflow Submit: nativen Event auslösen
    // e.preventDefault() hatten wir oben – hier triggern wir bewusst
    state.form.submit();
  }

  // ============================================================
  // 11. EVENT LISTENERS
  // ============================================================

  function bindEvents() {
    var prevBtn = qs("[data-msf-prev]", state.form);
    var nextBtn = qs("[data-msf-next]", state.form);
    var submitBtn = qs("[data-msf-submit]", state.form);

    if (prevBtn) prevBtn.addEventListener("click", prev);
    if (nextBtn) nextBtn.addEventListener("click", next);

    // Submit: wir übernehmen die Kontrolle
    state.form.addEventListener("submit", function (e) {
      e.preventDefault();
      collectStepData(state.current);
      submitForm();
    });

    // Keyboard: Enter auf Radio/Checkbox → weiter
    state.form.addEventListener("keydown", function (e) {
      if (
        e.key === "Enter" &&
        e.target.matches("input[type='radio'], input[type='checkbox']")
      ) {
        e.preventDefault();
        next();
      }
    });
  }

  // ============================================================
  // 12. INIT — Einstiegspunkt
  // ============================================================

  function init(config) {
    if (!config || !config.formId) {
      console.error("MSF: formId fehlt in der Config.");
      return;
    }

    var form = document.getElementById(config.formId);
    if (!form) {
      console.error(
        "MSF: Formular mit id '" + config.formId + "' nicht gefunden.",
      );
      return;
    }

    // State initialisieren
    state.config = config;
    state.config.steps = config.steps || []; // Leeres Array als Fallback
    state.current = 0;
    state.data = {};
    state.form = form;

    // Aufbau
    buildSteps();
    updateUI();
    bindEvents();

    if (state.config.steps.length === 0) {
      console.warn("MSF: Keine Steps konfiguriert. Uebergib steps: [...] in MSF.init().");
    } else {
      console.log("MSF: initialisiert mit", state.config.steps.length, "Steps.");
    }
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  global.MSF = {
    init: init,
    next: next,
    prev: prev,
    goToStep: goToStep,
    getData: function () {
      return state.data;
    },
  };
})(window);
