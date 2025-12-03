// ==UserScript==
// @name         BetBurger – Popup "Monto de apuesta" + Auto-fill footer (RightWrapper: 1º=round-to=1, 2º=monto)
// @namespace    tt.tools
// @version      1.1
// @description  Popup centrado superior (arrastrable, persistente). En .calculator-footer .right-button-wrapper: 1º input = 1 (round-to) y 2º input = monto del popup. Escritura silenciosa (setter nativo + eventos). Reaplica en SPA y cambios del DOM.
// @match        https://www.betburger.com/*
// @updateURL    https://raw.githubusercontent.com/gl0balw0rk/uscripts-tm/main/userscripts/betburger/popup.user.js
// @downloadURL  https://raw.githubusercontent.com/gl0balw0rk/uscripts-tm/main/userscripts/betburger/popup.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==
(function () {
    "use strict";

    /* ===== Persistencia ===== */
    const POS_KEY = "bb_popup_pos_v1";
    const VAL_KEY = "bb_popup_amount_v1";
    const OPEN_KEY = "bb_popup_open_v1";

    const DEFAULT_TOP = 10; // px
    const DEFAULT_WIDTH = 180; // px

    const loadPos = () => GM_getValue(POS_KEY, { mode: "center" });
    const savePos = (p) => GM_setValue(POS_KEY, p);
    const loadVal = () => GM_getValue(VAL_KEY, "");
    const saveVal = (v) => GM_setValue(VAL_KEY, v);
    const loadOpen = () => GM_getValue(OPEN_KEY, true);
    const saveOpen = (o) => GM_setValue(OPEN_KEY, !!o);

    /* ===== Helpers ===== */
    const digits = (s) => (s || "").replace(/\D+/g, "");
    const visible = (el) =>
        !!el &&
        el.offsetParent !== null &&
        getComputedStyle(el).visibility !== "hidden";
    const fireInput = (el) => {
        try {
            el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        } catch {
            el.dispatchEvent(new Event("input", { bubbles: true }));
        }
    };
    const fireChange = (el) =>
        el.dispatchEvent(new Event("change", { bubbles: true }));

    function setNativeValue(el, value) {
        try {
            if (el instanceof HTMLInputElement) {
                const d = Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype,
                    "value"
                );
                d && d.set ? d.set.call(el, value) : (el.value = value);
            } else if (el instanceof HTMLTextAreaElement) {
                const d = Object.getOwnPropertyDescriptor(
                    HTMLTextAreaElement.prototype,
                    "value"
                );
                d && d.set ? d.set.call(el, value) : (el.value = value);
            } else {
                el.value = value;
            }
        } catch {
            el.value = value;
        }
    }

    function setEditor(el, val) {
        if (!el) return false;
        setNativeValue(el, String(val));
        fireInput(el);
        fireChange(el);
        return true;
    }

    /* ===== Footer targeting ===== */
    function rightWrapper() {
        const root = document.querySelector(".calculator-footer");
        return root
            ? root.querySelector(".right-button-wrapper") || root
            : null;
    }
    function rightInputs() {
        const rw = rightWrapper();
        if (!rw) return [];
        return Array.from(
            rw.querySelectorAll('label.base-input input[type="text"]')
        ).filter(visible);
    }

    function applyFooter(amount) {
        const inputs = rightInputs();
        if (inputs.length < 2) return false;
        const roundTo = inputs[0]; // 1º input => redondeo
        const stake = inputs[1]; // 2º input => monto popup
        // setEditor(roundTo, "1000");
        setEditor(stake, digits(amount));
        return true;
    }

    function retryApply(amount, tries = 14, delay = 120) {
        let n = 0;
        const go = () => {
            n++;
            if (applyFooter(amount)) return;
            if (n < tries) setTimeout(go, delay);
        };
        go();
    }

    /* ===== Popup ===== */
    function createPopup() {
        const wrap = document.createElement("div");
        wrap.id = "bb-sticky-popup";
        wrap.style.cssText = [
            "position:fixed",
            "z-index:2147483646",
            `top:${DEFAULT_TOP}px`,
            "left:50%",
            "transform:translateX(-50%)",
            `width:${DEFAULT_WIDTH}px`,
            "box-shadow:0 8px 24px rgba(0,0,0,.25)",
            "border-radius:12px",
            "background:#121212",
            "color:#fff",
            "font:14px/1.4 system-ui,Segoe UI,Roboto,Arial,sans-serif",
            "user-select:none",
        ].join(";");

        const header = document.createElement("div");
        header.style.cssText =
            "display:flex;align-items:center;justify-content:space-between;padding:6px 8px;cursor:grab;border-bottom:1px solid rgba(255,255,255,.08)";
        const title = document.createElement("div");
        title.textContent = "Monto de apuesta";
        title.style.cssText = "font-weight:600;opacity:.9;font-size:13px;";
        const btnMin = document.createElement("button");
        btnMin.textContent = "−";
        btnMin.title = "Minimizar";
        btnMin.style.cssText =
            "border:0;margin-left:6px;padding:4px 6px;border-radius:8px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer";
        header.append(title, btnMin);

        const body = document.createElement("div");
        body.style.cssText = "padding:8px 10px;";
        const inp = document.createElement("input");
        inp.type = "text";
        inp.placeholder = "Ej.: 50000";
        inp.inputMode = "numeric";
        inp.autocomplete = "off";
        inp.style.cssText =
            "width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#1a1a1a;color:#fff;font-size:14px;outline:none";

        inp.addEventListener("input", () => {
            const clean = digits(inp.value);
            if (clean !== inp.value) inp.value = clean;
            saveVal(clean);
            retryApply(clean);
        });

        const initial = loadVal();
        if (initial) {
            inp.value = digits(initial);
            retryApply(initial);
        }

        body.append(inp);
        wrap.append(header, body);
        document.body.appendChild(wrap);

        const applyOpen = (open) => {
            body.style.display = open ? "block" : "none";
            btnMin.textContent = open ? "−" : "+";
            saveOpen(open);
        };
        applyOpen(loadOpen());
        btnMin.addEventListener("click", () =>
            applyOpen(body.style.display === "none")
        );

        // Drag básico con persistencia
        let drag = false,
            sx = 0,
            sy = 0,
            sl = 0,
            st = 0;
        header.addEventListener("mousedown", (e) => {
            drag = true;
            header.style.cursor = "grabbing";
            const r = wrap.getBoundingClientRect();
            sx = e.clientX;
            sy = e.clientY;
            sl = r.left;
            st = r.top;
            e.preventDefault();
        });
        addEventListener("mousemove", (e) => {
            if (!drag) return;
            const dx = e.clientX - sx,
                dy = e.clientY - sy;
            wrap.style.left = sl + dx + "px";
            wrap.style.top = st + dy + "px";
            wrap.style.transform = "";
        });
        addEventListener("mouseup", () => {
            if (!drag) return;
            drag = false;
            header.style.cursor = "grab";
            const r = wrap.getBoundingClientRect();
            savePos({ mode: "custom", left: r.left, top: r.top });
        });

        const p = loadPos();
        if (
            p &&
            p.mode === "custom" &&
            Number.isFinite(p.left) &&
            Number.isFinite(p.top)
        ) {
            wrap.style.left = p.left + "px";
            wrap.style.top = p.top + "px";
            wrap.style.transform = "";
        }
    }

    /* ===== Observadores ===== */
    const mo = new MutationObserver(() => {
        const v = loadVal();
        if (v) retryApply(v);
    });
    function startObserver() {
        mo.observe(document.body, { childList: true, subtree: true });
    }

    let lastHref = location.href;
    function checkUrl() {
        if (location.href !== lastHref) {
            lastHref = location.href;
            const v = loadVal();
            if (v) retryApply(v);
        }
    }
    function hookHistory() {
        const _ps = history.pushState,
            _rs = history.replaceState;
        function wrap(fn) {
            return function () {
                const r = fn.apply(this, arguments);
                setTimeout(checkUrl, 0);
                return r;
            };
        }
        history.pushState = wrap(_ps);
        history.replaceState = wrap(_rs);
        addEventListener("popstate", checkUrl);
    }

    /* ===== Init ===== */
    function init() {
        createPopup();
        startObserver();
        hookHistory();
        const v = loadVal();
        if (v) retryApply(v);
    }

    if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();
