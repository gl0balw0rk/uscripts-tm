// ==UserScript==
// @name         BetBurger → BetPlay Cross-Window Type (TM bus) - radio lock por atajo, reseteo por cambio de apuesta
// @namespace    tt.tools
// @version      1.0
// @description  Ctrl+Shift+1/2 desde BetPlay pide valores a BetBurger (.calculator-body hijos 1/2), escribe simulando tecleo y fija el radio según el primer atajo. El lock se resetea al cambiar de apuesta (cambio de URL o refresco del contenedor .calculator-body).
// @match        https://www.betburger.com/*
// @match        https://betburger.com/*
// @match        https://betplay.com.co/*
// @match        https://www.betplay.com.co/*
// @match        https://pin1111.com/*
// @match        https://www.pin1111.com/*
// @match        https://stake.com.co/*
// @match        https://www.stake.com.co/*
// @match        https://bwin.co/*
// @match        https://www.bwin.co/*
// @updateURL    https://raw.githubusercontent.com/gl0balw0rk/uscripts-tm/main/userscripts/cross-window.user.js
// @downloadURL  https://raw.githubusercontent.com/gl0balw0rk/uscripts-tm/main/userscripts/cross-window.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==
(function () {
    "use strict";

    /* ===== CONFIG ===== */
    const ORIGEN_RE = /^https:\/\/(www\.)?betburger\.com\//i;
    const DESTINO_RE =
        /^https:\/\/(?:www\.)?(?:betplay\.com\.co|pin1111\.com|stake\.com\.co|bwin\.co)\//i;

    // Campos por hijo directo dentro de .calculator-body
    const ORIGEN_SELECTORS = {
        1: [
            ".calculator-body > :nth-child(1) .with-commission-value + label input",
            ".calculator-body > :nth-child(1) label:nth-of-type(3) input",
            '.calculator-body > :nth-child(1) input[type="text"]',
        ],
        2: [
            ".calculator-body > :nth-child(2) .with-commission-value + label input",
            ".calculator-body > :nth-child(2) label:nth-of-type(3) input",
            '.calculator-body > :nth-child(2) input[type="text"]',
        ],
    };

    const RADIO_SELECTORS = {
        1: '.calculator-body > :nth-child(1) input[type="radio"]',
        2: '.calculator-body > :nth-child(2) input[type="radio"]',
    };

    const CHANNEL = "bb_to_bp_v1";
    const DESTINO_TIMEOUT_MS = 5000;
    const CLEAR_BEFORE_TYPING = true;

    /* ===== STATE (no persistente) ===== */
    // Lock en memoria (se pierde en navegación o si el contenedor se reemplaza)
    let radioLocked = null; // 1 | 2 | null
    let lastHref = location.href;

    /* ===== HELPERS ===== */
    const isOrigen = ORIGEN_RE.test(location.href);
    const isDestino = DESTINO_RE.test(location.href);

    const nowId = () =>
        `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const getSel = () => (window.getSelection()?.toString() || "").trim();
    const digits = (s) => (s || "").replace(/\D+/g, "");

    function pick(list) {
        for (const sel of list) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const val = (el.value ?? el.textContent ?? "").toString().trim();
            if (val) return val;
        }
        return "";
    }

    function getOrigenText(slot = 1) {
        const s = getSel();
        if (s) return digits(s);
        const list = ORIGEN_SELECTORS[slot] || ORIGEN_SELECTORS[1];
        return digits(pick(list));
    }

    function fire(el, type) {
        el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    }
    function key(el, type, key) {
        el.dispatchEvent(
            new KeyboardEvent(type, { key, bubbles: true, cancelable: true })
        );
    }
    function inputEvt(el, data = "") {
        try {
            el.dispatchEvent(
                new InputEvent("input", {
                    bubbles: true,
                    cancelable: true,
                    data,
                    inputType: data ? "insertText" : "insertReplacementText",
                })
            );
        } catch {
            fire(el, "input");
        }
    }

    function clearEl(el) {
        if (!el) return;
        if (
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement
        ) {
            const cur = el.value ?? "";
            el.focus();
            try {
                el.setSelectionRange(0, cur.length);
            } catch {}
            try {
                el.setRangeText("", 0, cur.length, "end");
            } catch {
                el.value = "";
            }
            inputEvt(el, "");
            fire(el, "change");
            return;
        }
        if (el.isContentEditable) {
            el.focus();
            document.execCommand("selectAll");
            document.execCommand("delete");
            inputEvt(el, "");
            fire(el, "change");
        }
    }

    function typeInto(el, text) {
        if (!el || !text) return;
        el.focus();
        if (CLEAR_BEFORE_TYPING) clearEl(el);
        if (
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement
        ) {
            for (const ch of text) {
                key(el, "keydown", ch);
                key(el, "keypress", ch);
                const st = el.selectionStart ?? el.value?.length ?? 0,
                    en = el.selectionEnd ?? st;
                try {
                    el.setRangeText(ch, st, en, "end");
                } catch {
                    el.value = (el.value || "") + ch;
                }
                inputEvt(el, ch);
                key(el, "keyup", ch);
            }
            fire(el, "change");
            return;
        }
        if (el.isContentEditable) {
            for (const ch of text) {
                key(el, "keydown", ch);
                key(el, "keypress", ch);
                const ok = document.execCommand("insertText", false, ch);
                if (!ok) {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount) {
                        const r = sel.getRangeAt(0);
                        r.deleteContents();
                        r.insertNode(document.createTextNode(ch));
                        r.collapse(false);
                    }
                }
                inputEvt(el, ch);
                key(el, "keyup", ch);
            }
            fire(el, "change");
        }
    }

    function typeIntoActive(text) {
        if (!text) return;
        const el = document.activeElement;
        const w =
            'input:not([type="hidden"]):not([disabled]), textarea, [contenteditable="true"]';
        const t =
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement ||
            el?.isContentEditable
                ? el
                : document.querySelector(w);
        if (!t) return;
        typeInto(t, text);
    }

    // === Radio lock: fija el radio sólo la primera vez por apuesta ===
    function selectRadio(slot) {
        const sel = RADIO_SELECTORS[slot];
        if (!sel) return false;
        const radio = document.querySelector(sel);
        if (!radio) return false;
        try {
            radio.focus();
        } catch {}
        try {
            radio.click();
        } catch {}
        radio.checked = true;
        fire(radio, "change");
        return true;
    }

    function setRadioOnce(slot) {
        if (radioLocked === 1 || radioLocked === 2) return radioLocked;
        if (slot !== 1 && slot !== 2) return null;
        const ok = selectRadio(slot);
        if (ok) radioLocked = slot;
        return radioLocked;
    }

    function resetRadioLock() {
        radioLocked = null;
    }

    // Reseteo por cambio de URL (SPA compatible)
    function hookHistory() {
        const _ps = history.pushState;
        const _rs = history.replaceState;
        function wrap(fn) {
            return function () {
                const r = fn.apply(this, arguments);
                setTimeout(checkUrl, 0);
                return r;
            };
        }
        history.pushState = wrap(_ps);
        history.replaceState = wrap(_rs);
        window.addEventListener("popstate", checkUrl);
    }
    function checkUrl() {
        if (location.href !== lastHref) {
            lastHref = location.href;
            resetRadioLock();
        }
    }

    // Reseteo por reemplazo/limpieza del contenedor .calculator-body
    function observeCalculator() {
        const root = document.body;
        const mo = new MutationObserver((muts) => {
            for (const m of muts) {
                // Si se añadió/eliminó un contenedor calculator-body o cambia su primer/segundo hijo, resetea
                if (
                    [...m.addedNodes, ...m.removedNodes].some(
                        (n) =>
                            n.nodeType === 1 && n.matches?.(".calculator-body")
                    )
                ) {
                    resetRadioLock();
                    return;
                }
                if (
                    m.target &&
                    m.target.nodeType === 1 &&
                    m.target.matches?.(".calculator-body")
                ) {
                    resetRadioLock();
                    return;
                }
            }
        });
        mo.observe(root, { childList: true, subtree: true });
    }

    /* ===== PROTOCOLO ===== */
    const REQ_KEY = `XFER_REQ_${CHANNEL}`;

    GM_addValueChangeListener(REQ_KEY, (_k, _o, n, remote) => {
        if (
            !remote ||
            !isOrigen ||
            !n ||
            typeof n !== "object" ||
            n.channel !== CHANNEL
        )
            return;
        const { id, slot = 1 } = n;
        setRadioOnce(slot); // fija sólo si aún no está
        const text = getOrigenText(slot);
        const RES = `XFER_RES_${CHANNEL}_${id}`;
        GM_setValue(RES, {
            id,
            channel: CHANNEL,
            text,
            ts: Date.now(),
            from: location.href,
            slot,
        });
    });

    function requestAndType(slot = 1) {
        const id = nowId();
        const RES = `XFER_RES_${CHANNEL}_${id}`;
        let done = false;
        let to = null;
        GM_addValueChangeListener(RES, (_k, _o, n, remote) => {
            if (!remote || done) return;
            done = true;
            if (to) clearTimeout(to);
            if (n && typeof n === "object") {
                typeIntoActive(n.text || "");
                console.log(`[TM] Escrito slot ${slot}:`, n.text);
            }
        });
        GM_setValue(REQ_KEY, {
            id,
            channel: CHANNEL,
            ts: Date.now(),
            from: location.href,
            slot,
        });
        to = setTimeout(() => {
            if (done) return;
            done = true;
            alert(
                "Sin respuesta desde BetBurger. ¿Ventana abierta y script activo?"
            );
        }, DESTINO_TIMEOUT_MS);
    }

    // Atajos en BetPlay
    if (isDestino) {
        window.addEventListener(
            "keydown",
            (ev) => {
                if (ev.ctrlKey && ev.shiftKey && ev.code === "Digit1")
                    requestAndType(1);
                if (ev.ctrlKey && ev.shiftKey && ev.code === "Digit2")
                    requestAndType(2);
            },
            { passive: true }
        );
        GM_registerMenuCommand(
            "Solicitar y ESCRIBIR (Ctrl+Shift+1) [slot 1]",
            () => requestAndType(1)
        );
        GM_registerMenuCommand(
            "Solicitar y ESCRIBIR (Ctrl+Shift+2) [slot 2]",
            () => requestAndType(2)
        );
    }

    // Inicialización en ORIGEN: resets automáticos del lock por cambio de apuesta
    if (isOrigen) {
        hookHistory();
        observeCalculator();
        GM_registerMenuCommand("Reset radio lock (manual)", () => {
            resetRadioLock();
            alert("Radio lock reiniciado para esta apuesta.");
        });
    }
})();
